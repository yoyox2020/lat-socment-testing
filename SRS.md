# Software Requirements Specification (SRS)
## Social Media SNA & Intelligence Dashboard
Version 1.0 — Initial implementation baseline

## 1. Purpose
Build one local web dashboard to collect, organize, explore, and analyze social-media accounts and posts. Collection starts from a target (account, post URL/ID, keyword, hashtag) or a trending/search query. Data is normalized into a graph and analyzed using selectable SNA metrics.

The system is an analytical aid. Centrality, graph proximity, and engagement do not by themselves prove identity, coordination, intent, wrongdoing, or control.

## 2. Scope
### MVP included
- One primary dashboard/workspace for all projects and platforms.
- Project creation and management.
- EnsembleData adapter for supported profile, post, comment/reply, keyword/hashtag/trending operations.
- Asynchronous collection jobs with status, counts, and error reporting.
- Normalized account, post, and interaction storage with provenance.
- Graph modes: account interaction, account-post bipartite, and post interaction.
- Interactive graph: nodes, edges, pan, zoom, drag, labels, tooltips, selection, filters, fit-to-screen, and controllable force-layout animation.
- Metric selector, ranked results, node/edge detail panel, network summary.
- CSV/JSON export for nodes, edges, metrics, and run metadata.
- Docker Compose deployment.

### Explicitly out of scope for MVP
Private messages, private/restricted accounts, bypassing access controls/CAPTCHAs/rate limits, automated real-world identity attribution, automated accusations or intent inference, SaaS billing/multi-tenant administration, and real-time streaming unless explicitly supported and separately implemented by the provider.

## 3. Users
- Local Analyst: create projects, collect permitted data, run analyses, explore graphs, export results.
- Local Administrator: configure provider credentials, retention, and system settings.

MVP may be single-user and local-only. Authentication and authorization are mandatory before exposing the service beyond localhost.

## 4. Operating environment
Docker Engine + Docker Compose; modern desktop browser; Node.js 22 containers; PostgreSQL 16; Redis 7. Frontend at `localhost:5173`, API at `localhost:3000`. Database and Redis remain internal to the Docker network by default.

## 5. Functional requirements
**FR-01 Dashboard.** Provide project/platform/query controls, collection status, graph canvas, metric selector, filters, node/edge details, metric ranking, and export actions in one workspace.

**FR-02 Projects.** Create, rename, archive, and delete analysis projects. Store platform, query type/value, collection window, and configuration.

**FR-03 Target collection.** Accept supported account handles, profile URLs, post URLs/IDs, keywords, or hashtags. Validate input and invoke only an applicable provider operation.

**FR-04 Trending/search.** Accept keyword/hashtag queries where supported. Display query, platform, collection time, result count, and pagination/coverage information. Label results as a sample; do not imply completeness.

**FR-05 Provider adapter.** Implement `EnsembleDataProvider` methods behind the backend. Isolate endpoint names, parameters, pagination, retries, and response mapping. Validate provider JSON; missing values remain null/unknown.

**FR-06 Jobs.** Run collection and heavy analysis asynchronously. Support queued, running, completed, partial, failed, and cancelled states. Do not expose tokens or sensitive headers in errors.

**FR-07 Canonical data.** Normalize provider records into accounts, posts, and interactions. Retain platform IDs and provenance. Restrict access to raw JSON payloads and apply configurable retention.

**FR-08 Graph construction.** Build edges only from explicit observed relationships. Every edge stores direction, type, weight/count, observation timestamps, and provenance. Supported examples: AUTHORED, COMMENTED_ON, REPLIED_TO, MENTIONED, and REPOSTED only when explicitly returned by the provider. Never infer a follow/friendship relation from a comment, mention, or co-occurrence.

**FR-09 Graph modes.** Offer (a) account interaction graph, (b) account-post bipartite graph, and (c) post interaction graph. The account projection must preserve links back to the original interaction evidence.

**FR-10 Visualization.** Support pan/zoom, fit, drag, select, labels/tooltips, node color by type/platform/community, node size by selected metric, edge width by weight, date/platform/type filters, N-hop neighborhood focus, legend, counts, and pause/restart controls for layout animation. Animation must not block inspection or keyboard accessibility.

**FR-11 Metrics.** Select one metric for graph styling and ranking. MVP metric choices: degree (in/out for directed graph), betweenness, closeness/harmonic closeness, eigenvector, PageRank, clustering coefficient, density, connected components, and optional community detection/modularity after validation. UI must identify node-level versus network-level metrics.

**FR-12 Reproducibility.** Store graph mode, filters, directed/undirected setting, weighted/unweighted setting, algorithm/version, and timestamp for every analysis run. Warn when a metric is undefined or unsuitable for a graph type.

**FR-13 Ranking.** Show rank, node label, platform/type, metric value, and available source link. Support sorting and search.

**FR-14 Details/provenance.** Selecting a node/edge shows source metadata and provenance. Distinguish provider-observed fields from system-derived metrics.

**FR-15 Export.** Export node CSV, edge CSV, metric ranking CSV, and analysis metadata JSON. Include project/run IDs and collection timestamps.

**FR-16 Secrets.** Configure EnsembleData token via environment/secret mechanism. Never return it from APIs, include it in frontend bundles, or log it.

**FR-17 Audit.** Record provider operation, query, timestamps, result counts, job status, error category, and analysis configuration.

## 6. Non-functional requirements
- **NFR-01 Local-first:** all application services run in Docker locally; provider calls require internet.
- **NFR-02 Security:** secrets outside source control; input and provider-response validation; parameterized SQL; request-size/rate limits; secure headers; no unnecessary personal data in logs; DB/cache not publicly exposed by default.
- **NFR-03 Privacy/compliance:** use only data available for a permitted purpose; respect provider/platform terms, applicable law, retention limits, and deletion requests. Do not collect sensitive personal data without a lawful, necessary, explicitly approved basis.
- **NFR-04 Performance targets:** warm dashboard under 3 seconds on a typical development machine; local health API under 500 ms; target usability around 1,000 visible nodes/5,000 edges on a modern desktop. Larger graphs require filtering, aggregation, or sampling clearly labelled.
- **NFR-05 Reliability:** bounded exponential retries for transient errors only. Do not endlessly retry invalid requests or quota/billing failures.
- **NFR-06 Maintainability:** TypeScript, modular adapters, migrations, automated tests, documented API contracts.
- **NFR-07 Explainability:** metric definitions, graph construction rules, and data limitations available in UI and export metadata.

## 7. Suggested database tables
`analysis_projects`, `collection_jobs`, `social_accounts`, `social_posts`, `social_interactions`, `analysis_runs`, `graph_nodes`, `graph_edges`, `node_metrics`, and `audit_events`. See `../database/schema.sql`.

## 8. API outline
- `GET /health`
- `GET/POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/collections`
- `GET /api/collections/:jobId`
- `GET /api/projects/:id/graph?mode=account|bipartite|post`
- `POST /api/projects/:id/analysis-runs`
- `GET /api/analysis-runs/:runId`
- `GET /api/analysis-runs/:runId/metrics`
- `GET /api/analysis-runs/:runId/export?type=nodes|edges|metrics`

## 9. Acceptance criteria
1. `docker compose up --build` starts frontend, API, worker, PostgreSQL, and Redis.
2. Dashboard loads locally and reports API/database health.
3. Analyst can create a project and submit a target/search query.
4. With a valid token and supported endpoint, a collection job normalizes records; without a token, a clear configuration error appears.
5. Graph is generated only from provenance-backed stored records.
6. Analyst can change graph mode, filters, and metric selection.
7. Betweenness and degree centrality are computed and displayed with graph assumptions.
8. Selecting a node reveals metadata and provenance.
9. CSV/JSON exports include run metadata.
10. Tests cover normalization, graph building, metric calculation, and secret redaction.

## 10. Risks and assumptions
- Confirm exact EnsembleData endpoint availability, parameters, response shapes, quotas, pricing, and supported platforms using current account documentation.
- Not every platform/endpoint exposes comments, replies, follower lists, or complete trending datasets.
- Betweenness can be expensive on large graphs; calculate in workers and clearly label any approximation.
- Do not merge cross-platform accounts solely because display names match.
- API and platform access rules may change.

## 11. Implementation phases
1. Docker/config/database schema and migrations.
2. EnsembleData adapter and response validation.
3. Normalization, idempotency, provenance.
4. Graph builder and graph modes.
5. Degree, betweenness, closeness, PageRank; then other metrics.
6. Dashboard graph, controls, details, ranking.
7. Exports, audit, retention, security and load testing.
