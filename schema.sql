CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS analysis_projects (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, description TEXT, platform TEXT,
 query_type TEXT NOT NULL CHECK (query_type IN ('account','post','keyword','hashtag','trending','mixed')),
 query_value TEXT, collection_config JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), archived_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS collection_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
 provider TEXT NOT NULL DEFAULT 'ensembledata', operation TEXT NOT NULL, request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
 status TEXT NOT NULL CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
 started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, fetched_count INTEGER NOT NULL DEFAULT 0,
 normalized_count INTEGER NOT NULL DEFAULT 0, error_code TEXT, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS social_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT NOT NULL, platform_user_id TEXT NOT NULL,
 username TEXT, display_name TEXT, profile_url TEXT, bio TEXT, follower_count BIGINT, following_count BIGINT,
 verified BOOLEAN, raw_data JSONB, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(platform, platform_user_id)
);
CREATE TABLE IF NOT EXISTS social_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT NOT NULL, platform_post_id TEXT NOT NULL,
 author_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL, post_url TEXT, text_content TEXT,
 media_type TEXT, published_at TIMESTAMPTZ, like_count BIGINT, comment_count BIGINT, share_count BIGINT, view_count BIGINT,
 raw_data JSONB, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(platform, platform_post_id)
);
CREATE TABLE IF NOT EXISTS social_interactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT NOT NULL, interaction_type TEXT NOT NULL,
 actor_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
 target_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
 target_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
 parent_interaction_id UUID REFERENCES social_interactions(id) ON DELETE SET NULL,
 source_platform_id TEXT, interaction_text TEXT, occurred_at TIMESTAMPTZ, raw_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (target_account_id IS NOT NULL OR target_post_id IS NOT NULL OR parent_interaction_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS analysis_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES analysis_projects(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
 graph_mode TEXT NOT NULL, directed BOOLEAN NOT NULL DEFAULT true, weighted BOOLEAN NOT NULL DEFAULT false,
 filters JSONB NOT NULL DEFAULT '{}'::jsonb, metric_config JSONB NOT NULL DEFAULT '{}'::jsonb, algorithm_version TEXT,
 node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
 started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS graph_nodes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
 source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('account','post')), source_entity_id UUID NOT NULL,
 graph_key TEXT NOT NULL, label TEXT, attributes JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(analysis_run_id, graph_key)
);
CREATE TABLE IF NOT EXISTS graph_edges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
 source_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 target_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 edge_type TEXT NOT NULL, directed BOOLEAN NOT NULL DEFAULT true, weight DOUBLE PRECISION NOT NULL DEFAULT 1,
 provenance JSONB NOT NULL DEFAULT '[]'::jsonb, first_observed_at TIMESTAMPTZ, last_observed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS node_metrics (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), analysis_run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
 graph_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, metric_name TEXT NOT NULL,
 metric_value DOUBLE PRECISION, rank INTEGER, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(analysis_run_id, graph_node_id, metric_name)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID REFERENCES analysis_projects(id) ON DELETE SET NULL,
 actor TEXT NOT NULL DEFAULT 'local-user', event_type TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_project_created ON collection_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_platform_username ON social_accounts(platform, username);
CREATE INDEX IF NOT EXISTS idx_posts_author_published ON social_posts(author_account_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON social_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_actor_time ON social_interactions(actor_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_target_account ON social_interactions(target_account_id);
CREATE INDEX IF NOT EXISTS idx_interactions_target_post ON social_interactions(target_post_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_run ON graph_nodes(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_run ON graph_edges(analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_metrics_run_metric_rank ON node_metrics(analysis_run_id, metric_name, rank);
