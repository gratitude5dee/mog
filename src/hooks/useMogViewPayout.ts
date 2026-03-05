import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/contexts/WalletContext";
import { requestWalletProof } from "@/lib/walletProof";

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
        await supabase.functions.invoke('content-interact', {
          body: {
            action_type: 'view',
            content_type: 'mog_post',
            content_id: postId,
          },
          headers: { 'x-wallet-address': address.toLowerCase() },
        });

        const walletProof = await requestWalletProof(address.toLowerCase(), "engagement_pay:mog_post:view");
        const { data, error } = await supabase.functions.invoke('engagement-pay', {
          body: {
            content_type: 'mog_post',
            content_id: postId,
            action_type: 'view',
            payer_wallet: address.toLowerCase(),
            wallet_proof: walletProof,
          },
        });

        if (error) {
          console.error('View payout error:', error);
          return;
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
