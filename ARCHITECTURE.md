# Architecture and Technical Design

## Component flow
```text
React/Vite + Sigma.js browser
          | local JSON API
          v
Node.js + Fastify API ------> PostgreSQL (canonical data)
          |                         ^
          | enqueue                  | normalized records
          v                         |
     Redis + BullMQ -> Worker -> EnsembleData API
                          |
                          v
               Graph builder / Graphology
                          |
                 SNA metric calculations
                          |
               analysis_runs + node_metrics
                          |
                    Graph API -> UI
```

## Technology choices
| Layer | Recommendation | Rationale |
|---|---|---|
| UI | React + Vite + TypeScript | Single-page dashboard |
| Graph rendering | Sigma.js + Graphology | Interactive WebGL network graph |
| API | Node.js + Fastify + TypeScript | Modular backend |
| Validation | Zod | Validate inputs and untrusted provider JSON |
| Database | PostgreSQL 16 | Relational source of truth, indexes, JSONB |
| Jobs | Redis 7 + BullMQ | Collection and SNA do not block HTTP |
| SNA | Graphology ecosystem | JavaScript-native graph algorithms |
| Deployment | Docker Compose | Local reproducible stack |

## Graph semantics
Account nodes represent platform accounts; post nodes represent posts. Suggested directed edges: `AUTHORED` account->post, `COMMENTED_ON` account->post, `REPLIED_TO` account->parent post/account only when parent reference exists, `MENTIONED` author->mentioned account only when explicit, and `REPOSTED` only when provider explicitly supplies the event. Never infer follows, friendship, coordination, endorsement, or identity from co-occurrence or comments.

## Metric interpretation
- **Degree:** adjacent edge count; directed graphs should report in-degree and out-degree separately.
- **Betweenness:** fraction of shortest paths through a node; a possible structural bridge in this observed graph, not proof of influence/control.
- **Closeness:** inverse average shortest-path distance; use harmonic closeness or component-aware handling for disconnected graphs.
- **Eigenvector:** score based on connections to high-scoring nodes; may be unsuitable for some graph structures.
- **PageRank:** directed importance based on incoming links; meaning depends on the edge type.
- **Clustering coefficient:** local tendency for neighbors to connect; often most interpretable on undirected projections.
- **Density:** network-level edge ratio.
- **Connected components:** groups linked by paths; directed graphs may need strongly connected components.
- **Modularity/community:** record algorithm and parameters, as results depend on implementation/resolution.

Metric scores are comparable only when graph construction, filters, direction, weighting, and algorithm settings match.

## Database principles
PostgreSQL is canonical. Keep raw provider JSON in restricted JSONB columns for traceability; query normalized columns for application behavior. Store timestamps in UTC. Use unique source IDs to make repeated collection idempotent. Index project IDs, platform IDs, timestamps, foreign keys, and analysis run IDs.

## Provider adapter
Implement methods only where supported by current EnsembleData API docs and subscription: `getAccountProfile`, `getAccountPosts`, `searchPosts`, `getPostComments`, `getPostDetails`. Keep provider HTTP calls, token handling, quotas, retries, and provider-specific normalization in backend modules. Browser never calls provider directly.

## Graph payload example
```json
{
  "runId": "uuid",
  "mode": "account-post-bipartite",
  "directed": true,
  "nodes": [{"id":"platform:account:123","label":"sample_user","kind":"account","platform":"tiktok"}],
  "edges": [{"id":"edge-1","source":"platform:account:123","target":"platform:post:456","kind":"COMMENTED_ON","weight":1}]
}
```

## Dashboard layout
Top bar: project/platform/query/time/job status. Left panel: collection input, graph mode, filters, metric selector. Center: graph canvas and layout controls. Right panel: selected node/edge details and provenance. Bottom/side panel: ranked table and network-level summary. Desktop-first; panels collapse on smaller screens.
