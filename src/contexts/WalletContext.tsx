import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet, useConnect, useDisconnect } from "thirdweb/react";
import { createWallet, inAppWallet, type Wallet } from "thirdweb/wallets";
import { apeChain, getThirdwebClient, isThirdwebReady } from "@/lib/thirdweb";

type SocialStrategy = "google" | "apple";

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  error: string | null;
}

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  connectExternal: (id: "io.metamask" | "com.coinbase.wallet" | "walletConnect") => Promise<void>;
  connectSocial: (strategy: SocialStrategy) => Promise<void>;
  preAuthEmail: (email: string) => Promise<void>;
  connectEmail: (email: string, verificationCode: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  isConfigured: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { connect: thirdwebConnect, isConnecting } = useConnect();
  const { disconnect: thirdwebDisconnect } = useDisconnect();
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(isThirdwebReady());

  // Bootstrap thirdweb client on mount (fetch client ID from edge function).
  useEffect(() => {
    let cancelled = false;
    getThirdwebClient()
      .then(() => {
        if (!cancelled) setIsConfigured(true);
      })
      .catch((e) => {
        console.error("Thirdweb config load failed:", e);
        if (!cancelled) {
          setIsConfigured(false);
          setError("Sign-in unavailable: failed to load Thirdweb configuration.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const address = account?.address ?? null;
  const isConnected = !!account;

  const handleError = (e: unknown, fallback: string) => {
    const msg = e instanceof Error ? e.message : fallback;
    console.error(fallback, e);
    setError(msg);
  };

  const connectExternal = useCallback(
    async (id: "io.metamask" | "com.coinbase.wallet" | "walletConnect") => {
      try {
        setError(null);
        const client = await getThirdwebClient();
        const w = createWallet(id);
        await thirdwebConnect(async () => {
          await w.connect({ client, chain: apeChain });
          return w;
        });
      } catch (e) {
        handleError(e, `Failed to connect ${id}`);
      }
    },
    [thirdwebConnect]
  );

  const connectSocial = useCallback(
    async (strategy: SocialStrategy) => {
      try {
        setError(null);
        const client = await getThirdwebClient();
        const w = inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } });
        await thirdwebConnect(async () => {
          await w.connect({ client, chain: apeChain, strategy });
          return w as unknown as Wallet;
        });
      } catch (e) {
        handleError(e, `Failed to sign in with ${strategy}`);
      }
    },
    [thirdwebConnect]
  );

  const preAuthEmail = useCallback(async (email: string) => {
    setError(null);
    try {
      const client = await getThirdwebClient();
      const { preAuthenticate } = await import("thirdweb/wallets/in-app");
      await preAuthenticate({ client, strategy: "email", email });
    } catch (e) {
      handleError(e, "Failed to send verification email");
      throw e;
    }
  }, []);

  const connectEmail = useCallback(
    async (email: string, verificationCode: string) => {
      try {
        setError(null);
        const client = await getThirdwebClient();
        const w = inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } });
        await thirdwebConnect(async () => {
          await w.connect({ client, chain: apeChain, strategy: "email", email, verificationCode });
          return w as unknown as Wallet;
        });
      } catch (e) {
        handleError(e, "Failed to verify email code");
      }
    },
    [thirdwebConnect]
  );

  const connect = useCallback(async () => {
    await connectExternal("io.metamask");
  }, [connectExternal]);

  const disconnect = useCallback(() => {
    if (wallet) thirdwebDisconnect(wallet);
  }, [wallet, thirdwebDisconnect]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const enforceChain = async () => {
      try {
        if (wallet && account && "switchChain" in wallet) {
          await (wallet as { switchChain?: (chain: typeof apeChain) => Promise<void> }).switchChain?.(apeChain);
        }
      } catch (e) {
        console.warn("Failed to switch to ApeChain", e);
      }
    };
    enforceChain();
  }, [wallet, account]);

  const state: WalletState = {
    address,
    isConnected,
    isConnecting,
    chainId: apeChain.id,
    error,
  };

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        connectExternal,
        connectSocial,
        preAuthEmail,
        connectEmail,
        disconnect,
        clearError,
        isConfigured,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
