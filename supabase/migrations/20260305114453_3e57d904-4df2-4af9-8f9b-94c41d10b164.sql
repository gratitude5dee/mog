-- Fix 1: mog_agent_profiles - Remove overly permissive SELECT policy
-- The agent_profiles_safe view already provides public access to non-sensitive fields
DROP POLICY IF EXISTS "Public read access for agent profiles" ON public.mog_agent_profiles;

-- Fix 2: music_video_transactions - Replace public SELECT with service_role only
DROP POLICY IF EXISTS "Users can view their video transactions" ON public.music_video_transactions;

CREATE POLICY "Service role can view video transactions"
  ON public.music_video_transactions
  FOR SELECT
  USING (
    ((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text
  );