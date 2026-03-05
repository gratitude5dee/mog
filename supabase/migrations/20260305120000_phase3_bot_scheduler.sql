-- Phase 3: Bot scheduler + idempotency primitives

CREATE TABLE IF NOT EXISTS public.bot_job_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_profile_id UUID NOT NULL REFERENCES public.mog_agent_profiles(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  cadence_minutes INTEGER NOT NULL DEFAULT 30 CHECK (cadence_minutes BETWEEN 1 AND 1440),
  max_actions_per_run INTEGER NOT NULL DEFAULT 3 CHECK (max_actions_per_run BETWEEN 1 AND 20),
  allow_like BOOLEAN NOT NULL DEFAULT true,
  allow_bookmark BOOLEAN NOT NULL DEFAULT true,
  allow_comment BOOLEAN NOT NULL DEFAULT false,
  allow_view BOOLEAN NOT NULL DEFAULT true,
  no_self_engagement BOOLEAN NOT NULL DEFAULT true,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  comment_templates TEXT[] NOT NULL DEFAULT '{}',
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_job_configs_next_run
  ON public.bot_job_configs (is_enabled, next_run_at);

CREATE TABLE IF NOT EXISTS public.bot_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.bot_job_configs(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  actions_attempted INTEGER NOT NULL DEFAULT 0,
  actions_succeeded INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bot_job_runs_job_started
  ON public.bot_job_runs (job_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor TEXT NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (endpoint, idempotency_key, actor)
);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires_at
  ON public.api_idempotency_keys (expires_at);

ALTER TABLE public.bot_job_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_job_configs_service_role_all ON public.bot_job_configs;
CREATE POLICY bot_job_configs_service_role_all
  ON public.bot_job_configs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS bot_job_runs_service_role_all ON public.bot_job_runs;
CREATE POLICY bot_job_runs_service_role_all
  ON public.bot_job_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS api_idempotency_service_role_all ON public.api_idempotency_keys;
CREATE POLICY api_idempotency_service_role_all
  ON public.api_idempotency_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_bot_job_configs_updated_at ON public.bot_job_configs;
CREATE TRIGGER update_bot_job_configs_updated_at
  BEFORE UPDATE ON public.bot_job_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
