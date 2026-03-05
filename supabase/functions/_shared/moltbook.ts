export type MoltbookAgent = {
  id: string;
  name: string;
  karma: number;
  avatar_url: string | null;
  is_claimed: boolean;
  owner?: {
    x_handle?: string | null;
    x_verified?: boolean | null;
  } | null;
  [key: string]: unknown;
};

export type MoltbookVerifyResponse = {
  success: boolean;
  valid: boolean;
  agent?: MoltbookAgent;
  error?: string;
  hint?: string;
};

const VERIFY_URL = "https://www.moltbook.com/api/v1/agents/verify-identity";

function getMoltbookMode(): "development" | "production" {
  return (Deno.env.get("MOLTBOOK_MODE") || "development").toLowerCase() === "production"
    ? "production"
    : "development";
}

function isMockEnabled(): boolean {
  const explicit = Deno.env.get("MOLTBOOK_ALLOW_MOCK");
  if (explicit !== undefined) {
    return explicit.toLowerCase() === "true";
  }
  return getMoltbookMode() === "development";
}

function isMockToken(token: string): boolean {
  return token.startsWith("mock_") || token.startsWith("test_");
}

const MOCK_AGENTS: Record<string, MoltbookAgent> = {
  mock_agent_1: {
    id: "moltbook_agent_001",
    name: "MogBot",
    karma: 420,
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=MogBot",
    is_claimed: true,
    owner: { x_handle: "moggy_owner", x_verified: true },
  },
  mock_agent_2: {
    id: "moltbook_agent_002",
    name: "StreamerBot",
    karma: 150,
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=StreamerBot",
    is_claimed: true,
    owner: null,
  },
  test_token: {
    id: "moltbook_agent_test",
    name: "TestAgent",
    karma: 100,
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=TestAgent",
    is_claimed: false,
    owner: { x_handle: "test_owner", x_verified: false },
  },
};

function mockVerify(token: string): MoltbookVerifyResponse {
  const knownAgent = MOCK_AGENTS[token];
  if (knownAgent) {
    return { success: true, valid: true, agent: knownAgent };
  }

  if (!isMockToken(token)) {
    return { success: false, valid: false, error: "invalid_token" };
  }

  return {
    success: true,
    valid: true,
    agent: {
      id: `moltbook_agent_${token.slice(0, 8)}`,
      name: `Agent_${token.slice(0, 6)}`,
      karma: 50,
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${token}`,
      is_claimed: true,
      owner: null,
    },
  };
}

export async function verifyMoltbookIdentity(token: string): Promise<MoltbookVerifyResponse> {
  const mode = getMoltbookMode();
  const allowMock = isMockEnabled();

  if (!token) {
    return { success: false, valid: false, error: "missing_identity_token" };
  }

  if (mode === "production" && isMockToken(token)) {
    return { success: false, valid: false, error: "mock_token_disallowed_in_production" };
  }

  if (mode === "development" && allowMock && isMockToken(token)) {
    return mockVerify(token);
  }

  const appKey = Deno.env.get("MOLTBOOK_APP_KEY");
  if (!appKey) {
    return { success: false, valid: false, error: "missing_app_key" };
  }

  const audience = Deno.env.get("MOLTBOOK_AUDIENCE");

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Moltbook-App-Key": appKey,
      },
      body: JSON.stringify({
        token,
        ...(audience ? { audience } : {}),
      }),
    });

    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const valid = Boolean(raw.valid);
    const success = typeof raw.success === "boolean" ? raw.success : valid;
    const error = typeof raw.error === "string" ? raw.error : undefined;

    if (!response.ok) {
      return {
        success: false,
        valid: false,
        error: error || `verify_http_${response.status}`,
      };
    }

    return {
      success,
      valid,
      agent: valid ? (raw.agent as MoltbookAgent) : undefined,
      error,
      hint: typeof raw.hint === "string" ? raw.hint : undefined,
    };
  } catch (_error) {
    return { success: false, valid: false, error: "verification_failed" };
  }
}

export async function requireMoltbookAgent(req: Request): Promise<
  | { ok: true; agent: MoltbookAgent }
  | { ok: false; status: number; error: string }
> {
  const token = req.headers.get("x-moltbook-identity");

  if (!token) {
    return { ok: false, status: 401, error: "missing_identity_token" };
  }

  const result = await verifyMoltbookIdentity(token);
  if (!result.valid || !result.agent) {
    return { ok: false, status: 401, error: result.error || "invalid_token" };
  }

  return { ok: true, agent: result.agent };
}
