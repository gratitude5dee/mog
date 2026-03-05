-- Phase 1 stability + wallet proof foundations

-- 1) engagement_payouts must support mog_post
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'engagement_payouts_content_type_check'
      AND conrelid = 'public.engagement_payouts'::regclass
  ) THEN
    ALTER TABLE public.engagement_payouts DROP CONSTRAINT engagement_payouts_content_type_check;
  END IF;
END $$;

ALTER TABLE public.engagement_payouts
  ADD CONSTRAINT engagement_payouts_content_type_check
  CHECK (content_type IN ('track', 'video', 'article', 'mog_post'));

-- 2) Wallet nonce storage for signature replay prevention
CREATE TABLE IF NOT EXISTS public.wallet_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_nonces_wallet_action
  ON public.wallet_nonces (wallet_address, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_nonces_expires
  ON public.wallet_nonces (expires_at);

ALTER TABLE public.wallet_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_nonces_service_role_all" ON public.wallet_nonces;
CREATE POLICY "wallet_nonces_service_role_all"
  ON public.wallet_nonces
  FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 3) Article body support for Mog article uploads
ALTER TABLE public.mog_posts
  ADD COLUMN IF NOT EXISTS article_body TEXT;

-- 4) Replace unsafe content interaction table policies
DROP POLICY IF EXISTS "Authenticated users can like content" ON public.content_likes;
DROP POLICY IF EXISTS "Users can remove their own likes" ON public.content_likes;
DROP POLICY IF EXISTS "Authenticated users can bookmark content" ON public.content_bookmarks;
DROP POLICY IF EXISTS "Users can remove their own bookmarks" ON public.content_bookmarks;
DROP POLICY IF EXISTS "Authenticated users can add comments" ON public.content_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.content_comments;

DROP POLICY IF EXISTS "content_likes_service_role_write" ON public.content_likes;
CREATE POLICY "content_likes_service_role_write"
  ON public.content_likes
  FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "content_bookmarks_service_role_write" ON public.content_bookmarks;
CREATE POLICY "content_bookmarks_service_role_write"
  ON public.content_bookmarks
  FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

DROP POLICY IF EXISTS "content_comments_service_role_write" ON public.content_comments;
CREATE POLICY "content_comments_service_role_write"
  ON public.content_comments
  FOR ALL
  USING ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role')
  WITH CHECK ((current_setting('request.jwt.claims', true)::json->>'role') = 'service_role');

-- 5) Atomic metric adjusters (avoid read-modify-write races)
CREATE OR REPLACE FUNCTION public.adjust_mog_post_metric(
  p_post_id UUID,
  p_metric TEXT,
  p_delta INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_metric = 'likes_count' THEN
    UPDATE public.mog_posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) + p_delta, 0)
    WHERE id = p_post_id;
  ELSIF p_metric = 'comments_count' THEN
    UPDATE public.mog_posts
    SET comments_count = GREATEST(COALESCE(comments_count, 0) + p_delta, 0)
    WHERE id = p_post_id;
  ELSIF p_metric = 'shares_count' THEN
    UPDATE public.mog_posts
    SET shares_count = GREATEST(COALESCE(shares_count, 0) + p_delta, 0)
    WHERE id = p_post_id;
  ELSIF p_metric = 'views_count' THEN
    UPDATE public.mog_posts
    SET views_count = GREATEST(COALESCE(views_count, 0) + p_delta, 0)
    WHERE id = p_post_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_content_metric(
  p_content_type TEXT,
  p_content_id UUID,
  p_metric TEXT,
  p_delta INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_content_type = 'track' THEN
    EXECUTE format(
      'UPDATE public.music_tracks SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE id = $2',
      p_metric,
      p_metric
    ) USING p_delta, p_content_id;
  ELSIF p_content_type = 'video' THEN
    EXECUTE format(
      'UPDATE public.music_videos SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE id = $2',
      p_metric,
      p_metric
    ) USING p_delta, p_content_id;
  ELSIF p_content_type = 'article' THEN
    EXECUTE format(
      'UPDATE public.articles SET %I = GREATEST(COALESCE(%I, 0) + $1, 0) WHERE id = $2',
      p_metric,
      p_metric
    ) USING p_delta, p_content_id;
  END IF;
END;
$$;
