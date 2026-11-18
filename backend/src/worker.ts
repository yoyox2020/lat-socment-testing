import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pool } from "./db.js";
import { EnsembleDataProvider, ConfigurationError } from "./provider.js";
import { normalizeProviderRecord } from "./normalize.js";

const connection = new Redis(process.env.REDIS_URL || "redis://redis:6379", { maxRetriesPerRequest: null });
const provider = new EnsembleDataProvider();

new Worker("sna-collections", async (job) => {
  const { jobId, projectId } = job.data as { jobId: string; projectId: string };
  await pool.query("UPDATE collection_jobs SET status='running',started_at=now() WHERE id=$1", [jobId]);
  try {
    const project = await pool.query("SELECT * FROM analysis_projects WHERE id=$1", [projectId]);
    if (!project.rows[0]) throw new Error("Project not found");
    const current = await pool.query("SELECT * FROM collection_jobs WHERE id=$1", [jobId]);
    const params = {
      ...(current.rows[0].request_params as Record<string, unknown>),
      query: project.rows[0].query_value,
    };
    const record = await provider.fetch(current.rows[0].operation, params);
    const client = await pool.connect();
    let normalized = 0;
    try {
      await client.query("BEGIN");
      normalized = await normalizeProviderRecord(client, project.rows[0].platform, record);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await pool.query(`
      UPDATE collection_jobs
      SET status='completed',finished_at=now(),fetched_count=$2,normalized_count=$3,error_code=NULL,error_message=NULL
      WHERE id=$1
    `, [jobId, record.accounts.length + record.posts.length + record.interactions.length, normalized]);
    await pool.query("INSERT INTO audit_events(project_id,event_type,details) VALUES($1,'collection.completed',$2)", [projectId, { collectionJobId: jobId, normalized }]);
  } catch (error) {
    const configuration = error instanceof ConfigurationError;
    const message = configuration ? error.message : "Provider collection failed";
    await pool.query(`
      UPDATE collection_jobs SET status='failed',finished_at=now(),error_code=$2,error_message=$3
      WHERE id=$1
    `, [jobId, configuration ? "CONFIGURATION_ERROR" : "PROVIDER_ERROR", message]);
    await pool.query("INSERT INTO audit_events(project_id,event_type,details) VALUES($1,'collection.failed',$2)", [projectId, { collectionJobId: jobId, errorCode: configuration ? "CONFIGURATION_ERROR" : "PROVIDER_ERROR" }]);
  }
}, { connection, concurrency: 2 });
