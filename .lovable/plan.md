
# $5DEE Coin Robustness Review & Karma Alignment Plan

## Executive Summary

After a thorough review of the $5DEE token system and its integration with the Mog platform, I've identified several gaps that need to be addressed to create a robust, unified reward economy that properly aligns $5DEE earnings with karma scores.

---

## Current State Analysis

### What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| `engagement-pay` edge function | Working | Handles all content types including `mog_post` |
| `token_config` table | Working | Configurable payout rates per action |
| `engagement_payouts` table | Working | Logs all payouts with status tracking |
| `creator_balances` table | Working | Trigger updates balances on confirmed payouts |
| Realtime notifications | Working | Subscription enabled for `engagement_payouts` |
| Agent API (`mog-interact`) | Working | Triggers payouts and increments karma +1 per action |

### Critical Gaps Identified

#### Gap 1: Karma Not Updated for Human Users
- **Problem**: When humans like/comment/share via `MogPostCard.tsx`, no karma tracking occurs
- **Evidence**: `mog_agent_profiles.karma` only updates in `mog-interact` edge function (agent-only endpoint)
- **Impact**: Human creators have no karma score; only agents accumulate karma

#### Gap 2: Human Like Button Doesn't Trigger $5DEE Payouts
- **Problem**: `MogPostCard.tsx` uses local `mog_likes` table but doesn't call `engagement-pay`
- **Evidence**: `handleLike()` only inserts into `mog_likes`, no payout trigger
- **Impact**: Likes on Mog posts from humans generate no $5DEE rewards

```typescript
// Current MogPostCard.tsx handleLike (lines 97-123)
const handleLike = async () => {
  // Only inserts to mog_likes - NO engagement-pay call!
  await supabase.from('mog_likes').insert({...});
  // Missing: triggerPayout('like')
}
```

#### Gap 3: Comment Payout Not Triggered
- **Problem**: `MogCommentsSheet.tsx` adds comments but doesn't trigger `engagement-pay`
- **Evidence**: `handleSubmit()` inserts comment and updates count, but no payout call
- **Impact**: Comments on Mog posts generate no $5DEE rewards

#### Gap 4: Bookmark/Share Actions Missing Payouts
- **Problem**: `MogPostCard.tsx` bookmark and share actions don't trigger payouts
- **Evidence**: No `triggerPayout()` calls in `handleBookmark()` or `handleShare()`
- **Impact**: These engagement actions generate no rewards

#### Gap 5: Duplicate Engagement Tables (Schema Fragmentation)
- **Problem**: Two separate systems exist:
  - `mog_likes`, `mog_bookmarks`, `mog_comments` (Mog-specific)
  - `content_likes`, `content_bookmarks`, `content_comments` (unified system)
- **Impact**: Inconsistent tracking, potential double-counting, maintenance overhead

#### Gap 6: Karma Scores Not Linked to $5DEE Earnings
- **Problem**: Karma in `mog_agent_profiles` is separate from `creator_balances.total_earned`
- **Evidence**: Karma increments by +1 per action (flat); $5DEE varies by action type (view=1, like=5, etc.)
- **Recommendation**: Align karma = total $5DEE earned for unified reputation

---

## Solution Architecture

### Option A: Unify Karma with $5DEE (Recommended)
- Karma score = cumulative $5DEE earnings
- Single source of truth: `creator_balances.total_earned`
- Applies to both agents and humans via wallet address

### Option B: Separate Karma and $5DEE
- Karma = engagement count (actions taken)
- $5DEE = earnings from engagement received
- More complex but distinguishes activity from earnings

I recommend **Option A** for simplicity and clarity.

---

## Implementation Tasks

### Task 1: Create Unified User Karma Table

```sql
CREATE TABLE IF NOT EXISTS public.user_karma (
  wallet_address TEXT PRIMARY KEY,
  karma INTEGER DEFAULT 0,
  actions_given INTEGER DEFAULT 0,  -- Likes/comments given
  actions_received INTEGER DEFAULT 0,  -- Likes/comments received
  total_earned NUMERIC(18,4) DEFAULT 0,  -- $5DEE earned
  total_spent NUMERIC(18,4) DEFAULT 0,  -- $5DEE triggered for others
  last_action_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Karma = total_earned (1:1 mapping)
-- OR Karma = actions_received * weighted score
```

### Task 2: Update MogPostCard.tsx - Add Payout Triggers

```typescript
// Add import
import { useEngagementPayout } from "@/hooks/useEngagementPayout";

// Inside component
const { triggerPayout } = useEngagementPayout({ 
  contentType: 'mog_post' as any, 
  contentId: post.id 
});

// Update handleLike
const handleLike = async () => {
  // ... existing code ...
  if (newLikedState) {
    await supabase.from('mog_likes').insert({...});
    triggerPayout('like'); // ADD THIS
  }
  // ...
};

// Update handleBookmark
const handleBookmark = async () => {
  if (newBookmarkedState) {
    await supabase.from('mog_bookmarks').insert({...});
    triggerPayout('bookmark'); // ADD THIS
  }
};

// Update handleShare
const handleShare = async () => {
  // ... after share count update ...
  triggerPayout('share'); // ADD THIS
};
```

### Task 3: Update MogCommentsSheet.tsx - Add Comment Payout

```typescript
// Add import
import { useEngagementPayout } from "@/hooks/useEngagementPayout";

// Inside component
const { triggerPayout } = useEngagementPayout({ 
  contentType: 'mog_post' as any, 
  contentId: postId 
});

// Update handleSubmit after successful comment insert
if (!error) {
  // ... existing code ...
  triggerPayout('comment'); // ADD THIS
}
```

### Task 4: Update ContentType to Include mog_post

```typescript
// src/types/engagement.ts
export type ContentType = 'track' | 'video' | 'article' | 'mog_post';
```

### Task 5: Create Karma Sync Trigger

```sql
-- Update karma when engagement_payouts are confirmed
CREATE OR REPLACE FUNCTION update_user_karma_on_payout()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    -- Update creator karma (receiver of engagement)
    INSERT INTO user_karma (wallet_address, karma, actions_received, total_earned)
    VALUES (NEW.creator_wallet, NEW.amount, 1, NEW.amount)
    ON CONFLICT (wallet_address) DO UPDATE SET
      karma = user_karma.karma + NEW.amount,
      actions_received = user_karma.actions_received + 1,
      total_earned = user_karma.total_earned + NEW.amount,
      last_action_at = now(),
      updated_at = now();
    
    -- Update payer karma (giver of engagement)
    INSERT INTO user_karma (wallet_address, actions_given, total_spent)
    VALUES (NEW.payer_wallet, 1, NEW.amount)
    ON CONFLICT (wallet_address) DO UPDATE SET
      actions_given = user_karma.actions_given + 1,
      total_spent = user_karma.total_spent + NEW.amount,
      last_action_at = now(),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_user_karma_update
AFTER INSERT OR UPDATE ON engagement_payouts
FOR EACH ROW EXECUTE FUNCTION update_user_karma_on_payout();
```

### Task 6: Display Karma on Profile UI

Add karma display to user profile pages showing:
- Total Karma Score (= $5DEE earned)
- Breakdown by action type (views, likes, comments, shares, bookmarks)
- Actions given vs received

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/xxxx.sql` | Create | Add `user_karma` table and sync trigger |
| `src/types/engagement.ts` | Modify | Add `mog_post` to ContentType union |
| `src/components/mog/MogPostCard.tsx` | Modify | Add payout triggers for like/bookmark/share |
| `src/components/mog/MogCommentsSheet.tsx` | Modify | Add payout trigger for comments |
| `src/hooks/useEngagementPayout.ts` | Modify | Handle `mog_post` content type (already works) |
| `src/components/mog/MogProfileKarma.tsx` | Create | UI component to display karma score |

---

## Karma Display Mockup

```text
┌─────────────────────────────────────────┐
│  🦞 @AgentName                          │
│  ─────────────────────────────────────  │
│  KARMA: 156 $5DEE                       │
│  ─────────────────────────────────────  │
│  👁️ Views:     42 (42 $5DEE)            │
│  ❤️ Likes:     18 (90 $5DEE)            │
│  💬 Comments:   2 (20 $5DEE)            │
│  🔗 Shares:     1 (3 $5DEE)             │
│  🔖 Bookmarks:  1 (2 $5DEE)             │
│  ─────────────────────────────────────  │
│  📊 Engagement Given: 124 actions       │
│  💰 Value Created: 312 $5DEE            │
└─────────────────────────────────────────┘
```

---

## Edge Cases & Anti-Abuse

### Already Handled
- Self-engagement blocked (can't like own content)
- Daily caps per action type (configurable in `token_config`)
- Duplicate payout prevention (same content+action+payer)

### Needs Attention
1. **Unlike/unbookmark handling**: Currently reduces UI count but doesn't claw back $5DEE (by design - rewards are immutable)
2. **Deleted content**: Payouts remain even if content is deleted (acceptable behavior)
3. **Rate limiting for humans**: Consider adding similar limits as agents (50 likes/day)

---

## Testing Strategy

After implementation:
1. Connect wallet
2. Navigate to `/watch`
3. Like a Mog post - verify toast shows "$5DEE earned by creator"
4. Check `engagement_payouts` table for new record
5. Check `user_karma` table for updated karma
6. Post a comment - verify payout triggered
7. Check creator's profile for karma display

---

## Technical Notes

- The `engagement-pay` edge function already supports `mog_post` content type
- The `useEngagementPayout` hook works with any content type (generic design)
- The `creator_balances` table already tracks per-action earnings
- Real-time subscription is already enabled for `engagement_payouts`

The main work is wiring up the UI actions to call the payout system and creating a unified karma display.
