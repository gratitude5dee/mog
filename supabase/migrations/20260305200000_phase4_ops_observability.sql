-- Phase 4: Staging observability events for rollout gating and canary metrics

CREATE TABLE IF NOT EXISTS public.ops_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  event_name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  mode_used TEXT,
  restore_source TEXT,
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_event_logs_created_at
  ON public.ops_event_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_event_logs_component_event
  ON public.ops_event_logs (component, event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_event_logs_level_outcome
  ON public.ops_event_logs (level, outcome, created_at DESC);

ALTER TABLE public.ops_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_event_logs_service_role_all ON public.ops_event_logs;
CREATE POLICY ops_event_logs_service_role_all
  ON public.ops_event_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
