import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet, useConnect, useDisconnect } from "thirdweb/react";
import { createWallet, inAppWallet, type Wallet } from "thirdweb/wallets";
import { thirdwebClient, apeChain, isThirdwebConfigured } from "@/lib/thirdweb";

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

  const address = account?.address ?? null;
  const isConnected = !!account;

  const guard = () => {
    if (!isThirdwebConfigured) {
      const msg = "Thirdweb is not configured. Set VITE_THIRDWEB_CLIENT_ID.";
      setError(msg);
      throw new Error(msg);
    }
  };

  const handleError = (e: unknown, fallback: string) => {
    const msg = e instanceof Error ? e.message : fallback;
    console.error(fallback, e);
    setError(msg);
  };

  const connectExternal = useCallback(
    async (id: "io.metamask" | "com.coinbase.wallet" | "walletConnect") => {
      try {
        guard();
        setError(null);
        const w = createWallet(id);
        await thirdwebConnect(async () => {
          await w.connect({ client: thirdwebClient, chain: apeChain });
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
        guard();
        setError(null);
        const w = inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } });
        await thirdwebConnect(async () => {
          await w.connect({ client: thirdwebClient, chain: apeChain, strategy });
          return w as unknown as Wallet;
        });
      } catch (e) {
        handleError(e, `Failed to sign in with ${strategy}`);
      }
    },
    [thirdwebConnect]
  );

  const preAuthEmail = useCallback(async (email: string) => {
    guard();
    setError(null);
    const w = inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } });
    try {
      await w.connect({
        client: thirdwebClient,
        chain: apeChain,
        strategy: "email",
        email,
        // @ts-expect-error preAuthenticate is fine via connect for some versions; use sendVerificationEmail when supported
      });
    } catch (e) {
      // Fallback: use the documented preAuthenticate API
      try {
        const { preAuthenticate } = await import("thirdweb/wallets/in-app");
        await preAuthenticate({ client: thirdwebClient, strategy: "email", email });
      } catch (inner) {
        handleError(inner, "Failed to send verification email");
        throw inner;
      }
    }
  }, []);

  const connectEmail = useCallback(
    async (email: string, verificationCode: string) => {
      try {
        guard();
        setError(null);
        const w = inAppWallet({ auth: { options: ["google", "apple", "email", "passkey"] } });
        await thirdwebConnect(async () => {
          await w.connect({
            client: thirdwebClient,
            chain: apeChain,
            strategy: "email",
            email,
            verificationCode,
          });
          return w as unknown as Wallet;
        });
      } catch (e) {
        handleError(e, "Failed to verify email code");
      }
    },
    [thirdwebConnect]
  );

  // Default connect = open MetaMask (kept for backward compat)
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
        isConfigured: isThirdwebConfigured,
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
