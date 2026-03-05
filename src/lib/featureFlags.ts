export type X402Mode = "legacy" | "gateway" | "auto";
export type MoltbookMode = "development" | "production";

function normalizeX402Mode(value: string | undefined): X402Mode {
  const normalized = (value || "legacy").toLowerCase();
  if (normalized === "gateway" || normalized === "auto") {
    return normalized;
  }
  return "legacy";
}

function normalizeMoltbookMode(value: string | undefined): MoltbookMode {
  const normalized = (value || "development").toLowerCase();
  return normalized === "production" ? "production" : "development";
}

export const x402Mode: X402Mode = normalizeX402Mode(import.meta.env.VITE_X402_MODE);
export const moltbookMode: MoltbookMode = normalizeMoltbookMode(import.meta.env.VITE_MOLTBOOK_MODE);
const defaultMoltbookMock = import.meta.env.DEV ? "true" : "false";

export const allowMoltbookMock =
  (import.meta.env.VITE_MOLTBOOK_ALLOW_MOCK || defaultMoltbookMock).toLowerCase() === "true";

export function shouldTryGatewayX402(): boolean {
  return x402Mode === "gateway" || x402Mode === "auto";
}

export function allowGatewayFallback(): boolean {
  return x402Mode === "auto";
}
