import { verifyMoltbookIdentity as verifyIdentity } from "./moltbook.ts";

export async function verifyMoltbookIdentity(token: string): Promise<{
  success: boolean;
  valid: boolean;
  agent?: unknown;
  error?: string;
  hint?: string;
}> {
  return verifyIdentity(token);
}
