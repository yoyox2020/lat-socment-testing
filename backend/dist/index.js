import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { pool } from "./db.js";
import { buildGraph } from "./graph.js";
import { calculateMetrics } from "./metrics.js";
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", { maxRetriesPerRequest: null });
const collectionQueue = new Queue("sna-collections", { connection: redis });
app.get("/health", async () => {
    await pool.query("SELECT 1");
    await redis.ping();
    return { status: "ok", api: true, database: true, redis: true };
});
app.get("/api/projects", async () => {
    const result = await pool.query("SELECT * FROM analysis_projects WHERE archived_at IS NULL ORDER BY created_at DESC");
    return result.rows;
});
const projectSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    platform: z.enum(["tiktok", "instagram", "x", "youtube", "facebook", "other"]).default("tiktok"),
    query_type: z.enum(["account", "post", "keyword", "hashtag", "trending", "mixed"]),
    query_value: z.string().min(1).max(500).optional(),
    collection_config: z.record(z.unknown()).default({}),
});
app.post("/api/projects", async (request, reply) => {
    const parsed = projectSchema.safeParse(request.body);
    if (!parsed.success)
        return reply.code(400).send({ error: "Invalid project", issues: parsed.error.issues });
    const p = parsed.data;
    const result = await pool.query(`
    INSERT INTO analysis_projects (name,description,platform,query_type,query_value,collection_config)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [p.name, p.description || null, p.platform, p.query_type, p.query_value || null, p.collection_config]);
    await pool.query("INSERT INTO audit_events(project_id,event_type,details) VALUES($1,'project.created',$2)", [result.rows[0].id, { name: p.name }]);
    return reply.code(201).send(result.rows[0]);
});
app.get("/api/projects/:id", async (request, reply) => {
    const { id } = request.params;
    const result = await pool.query("SELECT * FROM analysis_projects WHERE id=$1", [id]);
    if (!result.rows[0])
        return reply.code(404).send({ error: "Project not found" });
    return result.rows[0];
});
app.post("/api/projects/:id/collections", async (request, reply) => {
    const { id } = request.params;
    const body = z.object({
        operation: z.enum(["account", "post", "keyword", "hashtag", "trending", "mixed"]).default("mixed"),
        params: z.record(z.unknown()).default({}),
    }).parse(request.body);
    const project = await pool.query("SELECT * FROM analysis_projects WHERE id=$1", [id]);
    if (!project.rows[0])
        return reply.code(404).send({ error: "Project not found" });
    const job = await pool.query(`
    INSERT INTO collection_jobs(project_id,operation,request_params,status)
    VALUES($1,$2,$3,'queued') RETURNING *
  `, [id, body.operation, body.params]);
    await collectionQueue.add("collect", { jobId: job.rows[0].id, projectId: id }, { removeOnComplete: 100, removeOnFail: 100 });
    await pool.query("INSERT INTO audit_events(project_id,event_type,details) VALUES($1,'collection.queued',$2)", [id, { jobId: job.rows[0].id, operation: body.operation }]);
    return reply.code(202).send(job.rows[0]);
});
app.get("/api/collections/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const result = await pool.query("SELECT * FROM collection_jobs WHERE id=$1", [jobId]);
    if (!result.rows[0])
        return reply.code(404).send({ error: "Collection job not found" });
    return result.rows[0];
});
app.get("/api/projects/:id/graph", async (request, reply) => {
    const { id } = request.params;
    const query = z.object({ mode: z.enum(["account", "bipartite", "post"]).default("account") }).parse(request.query);
    const client = await pool.connect();
    try {
        const { payload } = await buildGraph(client, id, query.mode);
        return payload;
    }
    finally {
        client.release();
    }
});
app.post("/api/projects/:id/analysis-runs", async (request, reply) => {
    const { id } = request.params;
    const body = z.object({
        graphMode: z.enum(["account", "bipartite", "post"]).default("account"),
        metric: z.enum(["degree", "betweenness", "closeness", "pagerank", "clustering"]).default("degree"),
    }).parse(request.body);
    const result = await pool.query(`
    INSERT INTO analysis_runs(project_id,status,graph_mode,directed,weighted,filters,metric_config,algorithm_version,started_at)
    VALUES($1,'running',$2,true,true,'{}','{}','sna-js-1.0',now()) RETURNING *
  `, [id, body.graphMode]);
    const run = result.rows[0];
    const client = await pool.connect();
    try {
        const { graph, payload } = await buildGraph(client, id, body.graphMode);
        const values = calculateMetrics(graph, body.metric);
        await client.query("DELETE FROM graph_nodes WHERE analysis_run_id=$1", [run.id]);
        const nodeIds = new Map();
        for (const node of payload.nodes) {
            const inserted = await client.query(`
        INSERT INTO graph_nodes(analysis_run_id,source_entity_type,source_entity_id,graph_key,label,attributes)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id
      `, [run.id, node.kind, node.entityId, node.id, node.label, { platform: node.platform }]);
            nodeIds.set(node.id, inserted.rows[0].id);
        }
        for (const edge of payload.edges) {
            await client.query(`
        INSERT INTO graph_edges(analysis_run_id,source_node_id,target_node_id,edge_type,directed,weight,provenance)
        VALUES($1,$2,$3,$4,$5,$6,'[]')
      `, [run.id, nodeIds.get(edge.source), nodeIds.get(edge.target), edge.kind, edge.directed, edge.weight]);
        }
        const ranking = Object.entries(values).sort((a, b) => b[1] - a[1]);
        for (let i = 0; i < ranking.length; i++) {
            const [key, value] = ranking[i];
            const nodeId = nodeIds.get(key);
            if (nodeId)
                await client.query(`
        INSERT INTO node_metrics(analysis_run_id,graph_node_id,metric_name,metric_value,rank,metadata)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (analysis_run_id,graph_node_id,metric_name) DO UPDATE
        SET metric_value=EXCLUDED.metric_value,rank=EXCLUDED.rank
      `, [run.id, nodeId, body.metric, value, i + 1, { graphMode: body.graphMode }]);
        }
        await client.query(`
      UPDATE analysis_runs SET status='completed',node_count=$2,edge_count=$3,metric_config=$4,finished_at=now()
      WHERE id=$1
    `, [run.id, payload.nodes.length, payload.edges.length, { metric: body.metric }]);
    }
    catch (error) {
        await pool.query("UPDATE analysis_runs SET status='failed',finished_at=now() WHERE id=$1", [run.id]);
        throw error;
    }
    finally {
        client.release();
    }
    return reply.code(201).send(await getRun(run.id));
});
async function getRun(id) {
    const run = await pool.query("SELECT * FROM analysis_runs WHERE id=$1", [id]);
    return run.rows[0];
}
app.get("/api/analysis-runs/:runId", async (request, reply) => {
    const { runId } = request.params;
    const run = await getRun(runId);
    if (!run)
        return reply.code(404).send({ error: "Analysis run not found" });
    const nodes = await pool.query(`
    SELECT n.*, COALESCE(json_agg(json_build_object('metric_name',m.metric_name,'value',m.metric_value,'rank',m.rank))
      FILTER (WHERE m.id IS NOT NULL),'[]') metrics
    FROM graph_nodes n LEFT JOIN node_metrics m ON m.graph_node_id=n.id
    WHERE n.analysis_run_id=$1 GROUP BY n.id
  `, [runId]);
    const edges = await pool.query("SELECT * FROM graph_edges WHERE analysis_run_id=$1", [runId]);
    return { ...run, nodes: nodes.rows, edges: edges.rows };
});
app.get("/api/analysis-runs/:runId/metrics", async (request, reply) => {
    const { runId } = request.params;
    const result = await pool.query(`
    SELECT m.*,n.graph_key,n.label,n.attributes
    FROM node_metrics m JOIN graph_nodes n ON n.id=m.graph_node_id
    WHERE m.analysis_run_id=$1 ORDER BY m.metric_value DESC
  `, [runId]);
    return result.rows;
});
app.get("/api/analysis-runs/:runId/export", async (request, reply) => {
    const { runId } = request.params;
    const type = request.query.type || "metrics";
    const run = await getRun(runId);
    if (type === "metrics") {
        const result = await pool.query(`
      SELECT n.label,n.graph_key,m.metric_name,m.metric_value,m.rank
      FROM node_metrics m JOIN graph_nodes n ON n.id=m.graph_node_id
      WHERE m.analysis_run_id=$1 ORDER BY m.rank
    `, [runId]);
        return reply.header("Content-Type", "text/csv").send(toCsv(result.rows));
    }
    if (type === "metadata")
        return run;
    const table = type === "edges" ? "graph_edges" : "graph_nodes";
    const result = await pool.query(`SELECT * FROM ${table} WHERE analysis_run_id=$1`, [runId]);
    return reply.header("Content-Type", "text/csv").send(toCsv(result.rows));
});
function toCsv(rows) {
    if (!rows.length)
        return "";
    const keys = Object.keys(rows[0]);
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
}
await app.listen({ port: Number(process.env.API_PORT || 3000), host: "0.0.0.0" });
