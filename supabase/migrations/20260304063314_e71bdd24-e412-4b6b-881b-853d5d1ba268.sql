
-- Fix 1: Stream access tokens publicly readable (PUBLIC_DATA_EXPOSURE)
-- Replace USING (true) with wallet-based ownership check

DROP POLICY IF EXISTS "Streams accessible by token" ON public.music_streams;
CREATE POLICY "Streams accessible by token"
ON public.music_streams FOR SELECT
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

DROP POLICY IF EXISTS "Video streams accessible by token" ON public.music_video_streams;
CREATE POLICY "Video streams accessible by token"
ON public.music_video_streams FOR SELECT
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- Fix 2: Mog DELETE policies too permissive (INPUT_VALIDATION / Authorization Bypass)
-- Replace USING (true) with ownership checks

-- mog_posts: creator_wallet ownership
DROP POLICY IF EXISTS "Creators can delete own posts" ON public.mog_posts;
CREATE POLICY "Creators can delete own posts"
ON public.mog_posts FOR DELETE
USING (
  creator_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_posts: update also needs fixing (was USING true)
DROP POLICY IF EXISTS "Creators can update own posts" ON public.mog_posts;
CREATE POLICY "Creators can update own posts"
ON public.mog_posts FOR UPDATE
USING (
  creator_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_likes: user_wallet ownership
DROP POLICY IF EXISTS "Users can delete own likes" ON public.mog_likes;
CREATE POLICY "Users can delete own likes"
ON public.mog_likes FOR DELETE
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_bookmarks: user_wallet ownership
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.mog_bookmarks;
CREATE POLICY "Users can delete own bookmarks"
ON public.mog_bookmarks FOR DELETE
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_follows: follower_wallet ownership
DROP POLICY IF EXISTS "Users can unfollow" ON public.mog_follows;
CREATE POLICY "Users can unfollow"
ON public.mog_follows FOR DELETE
USING (
  follower_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_comments: user_wallet ownership
DROP POLICY IF EXISTS "Users can delete own comments" ON public.mog_comments;
CREATE POLICY "Users can delete own comments"
ON public.mog_comments FOR DELETE
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- mog_comments: update also needs fixing (was USING true)
DROP POLICY IF EXISTS "Update comment likes" ON public.mog_comments;
CREATE POLICY "Update comment likes"
ON public.mog_comments FOR UPDATE
USING (
  user_wallet = current_setting('request.headers', true)::json->>'x-wallet-address'
  OR (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);
