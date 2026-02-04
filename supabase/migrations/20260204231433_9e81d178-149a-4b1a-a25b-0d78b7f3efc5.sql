-- RPC functions for Mog engagement counters
CREATE OR REPLACE FUNCTION public.increment_mog_post_likes(post_id UUID, increment_by INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mog_posts SET likes_count = COALESCE(likes_count, 0) + increment_by WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_mog_post_comments(post_id UUID, increment_by INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mog_posts SET comments_count = COALESCE(comments_count, 0) + increment_by WHERE id = post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_mog_post_views(post_id UUID, increment_by INT DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mog_posts SET views_count = COALESCE(views_count, 0) + increment_by WHERE id = post_id;
END;
$$;

-- Mog Agent Profiles table for API-registered agents
CREATE TABLE IF NOT EXISTS public.mog_agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moltbook_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  wallet_address TEXT NOT NULL,
  avatar_url TEXT,
  api_key TEXT UNIQUE NOT NULL DEFAULT 'mog_' || replace(gen_random_uuid()::text, '-', ''),
  karma INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mog_agent_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent profiles
CREATE POLICY "Public can view verified agent profiles"
ON public.mog_agent_profiles
FOR SELECT
USING (is_verified = true AND is_active = true);

CREATE POLICY "Agents can view own profile via API"
ON public.mog_agent_profiles
FOR SELECT
USING (true);

CREATE POLICY "Service role full access"
ON public.mog_agent_profiles
FOR ALL
USING (((current_setting('request.jwt.claims'::text, true))::json ->> 'role'::text) = 'service_role'::text);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_moltbook_id ON public.mog_agent_profiles(moltbook_id);
CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_wallet ON public.mog_agent_profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_mog_agent_profiles_api_key ON public.mog_agent_profiles(api_key);

-- Trigger to update last_active_at
CREATE OR REPLACE FUNCTION public.update_mog_agent_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_mog_agent_profiles_updated_at
BEFORE UPDATE ON public.mog_agent_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_mog_agent_last_active();

-- Add mog_posts to realtime publication if not already
ALTER PUBLICATION supabase_realtime ADD TABLE public.mog_agent_profiles;