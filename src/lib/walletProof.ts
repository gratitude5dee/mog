import { supabase } from "@/integrations/supabase/client";

export type WalletProof = {
  address: string;
  action: string;
  nonce: string;
  message: string;
  signature: string;
};

type WalletProofChallenge = {
  nonce: string;
  message: string;
  expires_at: string;
};

function getEthereumProvider(): { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } {
  const provider = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!provider) {
    throw new Error("Wallet provider not available");
  }
  return provider;
}

export async function requestWalletProof(address: string, action: string): Promise<WalletProof> {
  if (!address) {
    throw new Error("Wallet address required for proof");
  }

  const challengeResponse = await supabase.functions.invoke("wallet-proof", {
    body: {
      address: address.toLowerCase(),
      action,
    },
  });

  if (challengeResponse.error || !challengeResponse.data?.challenge) {
    throw new Error(challengeResponse.error?.message || "Failed to create wallet challenge");
  }

  const challenge = challengeResponse.data.challenge as WalletProofChallenge;
  const provider = getEthereumProvider();

  const signature = (await provider.request({
    method: "personal_sign",
    params: [challenge.message, address.toLowerCase()],
  })) as string;

  if (!signature) {
    throw new Error("Wallet signature was rejected");
  }

  return {
    address: address.toLowerCase(),
    action,
    nonce: challenge.nonce,
    message: challenge.message,
    signature,
  };
}
