import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/contexts/WalletContext";
import { toast } from "sonner";

const VIEW_THRESHOLD_MS = 5000; // 5 seconds to count as a view

interface UseMogViewPayoutProps {
  postId: string;
  creatorWallet: string;
  isActive: boolean;
}

export function useMogViewPayout({ postId, creatorWallet, isActive }: UseMogViewPayoutProps) {
  const { address } = useWallet();
  const viewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    // Reset on post change
    hasTriggeredRef.current = false;
  }, [postId]);

  useEffect(() => {
    // Only track if post is active and user has wallet
    if (!isActive || !address || !creatorWallet) {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
      return;
    }

    // Don't track own content
    if (address.toLowerCase() === creatorWallet.toLowerCase()) {
      return;
    }

    // Don't track twice
    if (hasTriggeredRef.current) {
      return;
    }

    // Start timer
    viewTimerRef.current = setTimeout(async () => {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;

      try {
        const { data, error } = await supabase.functions.invoke('engagement-pay', {
          body: {
            content_type: 'mog_post',
            content_id: postId,
            action_type: 'view',
            payer_wallet: address,
          },
        });

        if (error) {
          console.error('View payout error:', error);
          return;
        }

        if (data?.success && !data?.skipped) {
          toast.success(`👁️ Viewed! Creator earned ${data.amount} $5DEE`, {
            description: `TX: ${data.tx_hash?.slice(0, 10)}...`,
            duration: 3000,
          });
        }
      } catch (err) {
        console.error('View payout failed:', err);
      }
    }, VIEW_THRESHOLD_MS);

    return () => {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };
  }, [isActive, address, postId, creatorWallet]);

  return { hasTriggered: hasTriggeredRef.current };
}
