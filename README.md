# Social Media SNA Dashboard

Local-first dashboard for collecting public/authorized social-media data through EnsembleData, normalizing accounts/posts/interactions, and exploring Social Network Analysis (SNA) graphs.

## Recommended stack
- Frontend: React + Vite + TypeScript; Sigma.js + Graphology for interactive WebGL graph visualization.
- Backend: Node.js 22 + TypeScript + Fastify.
- SNA: Graphology and graphology-metrics; compute heavy analyses in background workers.
- Database: PostgreSQL 16 as canonical relational store; JSONB for restricted raw provider payloads.
- Queue/cache: Redis 7 + BullMQ.
- Deployment: Docker Compose.

Neo4j is not required initially. PostgreSQL is appropriate for normalized source data, provenance, reproducible runs, and moderate graph sizes. Consider Neo4j only if multi-hop graph queries become a proven bottleneck.

## Run locally
1. `cp .env.example .env`
2. Set `ENSEMBLEDATA_API_TOKEN` in `.env`.
3. `docker compose up --build`
4. Dashboard: http://localhost:5173; API health: http://localhost:3000/health.

The current scaffold includes a starter UI, health endpoint, database schema, and worker placeholder. Provider endpoint mapping, full collection workflows, graph building, metric calculations, and production authentication remain implementation tasks.

## Important
EnsembleData is an external provider. Its endpoint availability, request parameters, quotas, response fields, pricing, and platform coverage must be verified against the API documentation for the user's account. Keep all provider calls behind a backend adapter; never expose the token to the browser.
