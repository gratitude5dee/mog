import { createThirdwebClient, getContract, defineChain } from "thirdweb";
import { inAppWallet, createWallet } from "thirdweb/wallets";

// Read public Thirdweb client ID from env (safe to expose).
const CLIENT_ID = import.meta.env.VITE_THIRDWEB_CLIENT_ID as string | undefined;

export const isThirdwebConfigured = Boolean(CLIENT_ID && CLIENT_ID.trim().length > 0);

if (!isThirdwebConfigured) {
  console.error(
    "[thirdweb] VITE_THIRDWEB_CLIENT_ID is missing. Set it in your environment to enable sign-in."
  );
}

// Use a clearly invalid placeholder so any accidental use surfaces a real thirdweb error
// instead of silently "succeeding" with a fake client.
export const thirdwebClient = createThirdwebClient({
  clientId: CLIENT_ID && CLIENT_ID.trim().length > 0 ? CLIENT_ID : "MISSING_VITE_THIRDWEB_CLIENT_ID",
});

// ApeChain (Mainnet)
export const apeChain = defineChain({
  id: 33139,
  name: "ApeChain",
  rpc: "https://rpc.apechain.com",
  nativeCurrency: {
    name: "ApeCoin",
    symbol: "APE",
    decimals: 18,
  },
});

// Wallets list: in-app wallet (social/email/passkey) + popular external wallets.
export const wallets = [
  inAppWallet({
    auth: {
      options: ["google", "apple", "email", "passkey"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
];

// $5DEE token contract (replace with actual address)
export const FIVE_DEE_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

export const tokenContract = getContract({
  client: thirdwebClient,
  chain: apeChain,
  address: FIVE_DEE_TOKEN_ADDRESS,
});

export const walletConfig = {
  chain: apeChain,
  client: thirdwebClient,
};
