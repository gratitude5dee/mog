-- Create unified user_karma table to track karma aligned with $5DEE earnings
CREATE TABLE IF NOT EXISTS public.user_karma (
  wallet_address TEXT PRIMARY KEY,
  karma NUMERIC(18,4) DEFAULT 0,  -- Karma = total $5DEE earned (1:1 mapping)
  actions_given INTEGER DEFAULT 0,  -- Likes/comments/shares given to others
  actions_received INTEGER DEFAULT 0,  -- Likes/comments/shares received
  total_earned NUMERIC(18,4) DEFAULT 0,  -- Total $5DEE earned from engagement
  total_spent NUMERIC(18,4) DEFAULT 0,  -- Total $5DEE triggered for others
  views_earned NUMERIC(18,4) DEFAULT 0,
  likes_earned NUMERIC(18,4) DEFAULT 0,
  comments_earned NUMERIC(18,4) DEFAULT 0,
  shares_earned NUMERIC(18,4) DEFAULT 0,
  bookmarks_earned NUMERIC(18,4) DEFAULT 0,
  last_action_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_karma ENABLE ROW LEVEL SECURITY;

-- Public read access for karma scores
CREATE POLICY "user_karma_public_read" ON public.user_karma
  FOR SELECT USING (true);

-- Users can only update their own karma (via triggers)
CREATE POLICY "user_karma_system_update" ON public.user_karma
  FOR ALL USING (true) WITH CHECK (true);

-- Create trigger function to update karma when engagement_payouts are confirmed
CREATE OR REPLACE FUNCTION public.update_user_karma_on_payout()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD IS NULL OR OLD.status != 'confirmed') THEN
    -- Update creator karma (receiver of engagement)
    INSERT INTO public.user_karma (wallet_address, karma, actions_received, total_earned)
    VALUES (NEW.creator_wallet, NEW.amount, 1, NEW.amount)
    ON CONFLICT (wallet_address) DO UPDATE SET
      karma = user_karma.karma + NEW.amount,
      actions_received = user_karma.actions_received + 1,
      total_earned = user_karma.total_earned + NEW.amount,
      last_action_at = now(),
      updated_at = now();
    
    -- Update action-specific earnings for creator
    CASE NEW.action_type
      WHEN 'view' THEN
        UPDATE public.user_karma SET views_earned = views_earned + NEW.amount WHERE wallet_address = NEW.creator_wallet;
      WHEN 'like' THEN
        UPDATE public.user_karma SET likes_earned = likes_earned + NEW.amount WHERE wallet_address = NEW.creator_wallet;
      WHEN 'comment' THEN
        UPDATE public.user_karma SET comments_earned = comments_earned + NEW.amount WHERE wallet_address = NEW.creator_wallet;
      WHEN 'share' THEN
        UPDATE public.user_karma SET shares_earned = shares_earned + NEW.amount WHERE wallet_address = NEW.creator_wallet;
      WHEN 'bookmark' THEN
        UPDATE public.user_karma SET bookmarks_earned = bookmarks_earned + NEW.amount WHERE wallet_address = NEW.creator_wallet;
      ELSE NULL;
    END CASE;
    
    -- Update payer karma (giver of engagement)
    INSERT INTO public.user_karma (wallet_address, actions_given, total_spent)
    VALUES (NEW.payer_wallet, 1, NEW.amount)
    ON CONFLICT (wallet_address) DO UPDATE SET
      actions_given = user_karma.actions_given + 1,
      total_spent = user_karma.total_spent + NEW.amount,
      last_action_at = now(),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create trigger on engagement_payouts
DROP TRIGGER IF EXISTS trigger_user_karma_update ON public.engagement_payouts;
CREATE TRIGGER trigger_user_karma_update
  AFTER INSERT OR UPDATE ON public.engagement_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_user_karma_on_payout();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_karma_karma ON public.user_karma(karma DESC);
CREATE INDEX IF NOT EXISTS idx_user_karma_total_earned ON public.user_karma(total_earned DESC);