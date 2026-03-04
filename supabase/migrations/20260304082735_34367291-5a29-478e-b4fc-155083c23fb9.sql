
-- ================================================================
-- SECURITY FIX: Address 6 error-level security findings
-- ================================================================

-- ======================
-- FIX 1: API Key Exposure in mog_agent_profiles
-- Drop the overly permissive USING(true) SELECT policy that exposes api_key
-- ======================

DROP POLICY IF EXISTS "Agents can view own profile via API" ON public.mog_agent_profiles;

-- Create a secure public view that excludes api_key
CREATE OR REPLACE VIEW public.agent_profiles_safe AS
SELECT 
  id, moltbook_id, name, description, avatar_url,
  wallet_address, is_verified, is_active,
  created_at, updated_at
FROM public.mog_agent_profiles
WHERE is_verified = true AND is_active = true;

-- Grant read access to the safe view
GRANT SELECT ON public.agent_profiles_safe TO anon, authenticated;

-- ======================
-- FIX 2: Header-based auth spoofing
-- Replace all x-wallet-address header policies with service_role-only
-- Since all mutations go through edge functions with service_role
-- ======================

-- music_streams: service_role only for SELECT
DROP POLICY IF EXISTS "Streams accessible by token" ON public.music_streams;
CREATE POLICY "Streams accessible by service role"
ON public.music_streams FOR SELECT
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- music_video_streams: service_role only for SELECT
DROP POLICY IF EXISTS "Video streams accessible by token" ON public.music_video_streams;
CREATE POLICY "Video streams accessible by service role"
ON public.music_video_streams FOR SELECT
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_posts: DELETE - service_role only
DROP POLICY IF EXISTS "Creators can delete own posts" ON public.mog_posts;
CREATE POLICY "Creators can delete own posts"
ON public.mog_posts FOR DELETE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_posts: UPDATE - service_role only
DROP POLICY IF EXISTS "Creators can update own posts" ON public.mog_posts;
CREATE POLICY "Creators can update own posts"
ON public.mog_posts FOR UPDATE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_likes: DELETE - service_role only
DROP POLICY IF EXISTS "Users can delete own likes" ON public.mog_likes;
CREATE POLICY "Users can delete own likes"
ON public.mog_likes FOR DELETE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_bookmarks: DELETE - service_role only
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.mog_bookmarks;
CREATE POLICY "Users can delete own bookmarks"
ON public.mog_bookmarks FOR DELETE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_follows: DELETE - service_role only
DROP POLICY IF EXISTS "Users can unfollow" ON public.mog_follows;
CREATE POLICY "Users can unfollow"
ON public.mog_follows FOR DELETE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_comments: DELETE - service_role only
DROP POLICY IF EXISTS "Users can delete own comments" ON public.mog_comments;
CREATE POLICY "Users can delete own comments"
ON public.mog_comments FOR DELETE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_comments: UPDATE - service_role only
DROP POLICY IF EXISTS "Update comment likes" ON public.mog_comments;
CREATE POLICY "Update comment likes"
ON public.mog_comments FOR UPDATE
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- ======================
-- FIX 3: Users table public exposure
-- Restrict to own profile only
-- ======================

DROP POLICY IF EXISTS "Users can view all users" ON public.users;
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- ======================
-- FIX 4: Sources table public exposure
-- Restrict to service_role only (admin/backend use)
-- ======================

DROP POLICY IF EXISTS "Sources are publicly readable" ON public.sources;
CREATE POLICY "Sources readable by service role"
ON public.sources FOR SELECT
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- ======================
-- FIX 5: Music transactions public exposure
-- Restrict to service_role (edge functions handle access)
-- ======================

DROP POLICY IF EXISTS "Users can view their transactions" ON public.music_transactions;
CREATE POLICY "Transactions accessible by service role"
ON public.music_transactions FOR SELECT
USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);
