import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Wallet } from "ethers";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const memoryDir = path.join(process.cwd(), "memory");
fs.mkdirSync(memoryDir, { recursive: true });

const supabaseUrl = (process.env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = process.env.STAGING_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const frontendUrl = (process.env.STAGING_FRONTEND_URL || "").replace(/\/$/, "");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing STAGING_SUPABASE_URL/SUPABASE_URL or STAGING_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const edgeBase = `${supabaseUrl}/functions/v1`;
const restBase = `${supabaseUrl}/rest/v1`;

const checks = [];
const endpointCalls = [];

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function buildUrl(base, params = {}) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function invokeEdge(functionName, { method = "POST", headers = {}, body } = {}) {
  const started = Date.now();
  const response = await fetch(`${edgeBase}/${functionName}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const latency = Date.now() - started;
  endpointCalls.push({ endpoint: functionName, latency_ms: latency, status: response.status });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    latency_ms: latency,
    text,
    json,
  };
}

async function restGet(table, params = {}) {
  const url = buildUrl(`${restBase}/${table}`, params);
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`REST ${table} failed (${response.status}): ${text}`);
  }
  return json;
}

function addCheck({ name, required = true, status, details = {}, error = null, duration_ms = 0 }) {
  checks.push({ name, required, status, duration_ms, details, error });
}

async function runCheck(name, required, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    addCheck({
      name,
      required,
      status: "pass",
      details: details || {},
      duration_ms: Date.now() - started,
    });
  } catch (error) {
    addCheck({
      name,
      required,
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - started,
    });
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const wallet = process.env.TEST_WALLET_PRIVATE_KEY
  ? new Wallet(process.env.TEST_WALLET_PRIVATE_KEY)
  : Wallet.createRandom();
const walletAddress = wallet.address.toLowerCase();

const fixtures = {
  post: null,
  selfPost: null,
  track: null,
};

await runCheck("Routing: /home and /mog resolve in staging frontend", true, async () => {
  requireCondition(Boolean(frontendUrl), "STAGING_FRONTEND_URL is required for routing check.");
  const home = await fetch(`${frontendUrl}/home`, { redirect: "manual" });
  const mog = await fetch(`${frontendUrl}/mog`, { redirect: "manual" });
  requireCondition(home.status < 400, `/home returned ${home.status}`);
  requireCondition(mog.status < 400, `/mog returned ${mog.status}`);
  return { home_status: home.status, mog_status: mog.status };
});

await runCheck("Fixtures: find published post and track", true, async () => {
  const posts = await restGet("mog_posts", {
    select: "id,creator_wallet,is_published,created_at",
    is_published: "eq.true",
    order: "created_at.desc",
    limit: "50",
  });
  const tracks = await restGet("music_tracks", {
    select: "id,artist_wallet,price",
    artist_wallet: "not.is.null",
    limit: "25",
  });

  requireCondition(Array.isArray(posts) && posts.length > 0, "No published mog_posts found.");
  requireCondition(Array.isArray(tracks) && tracks.length > 0, "No tracks with artist_wallet found.");

  const firstPost = posts.find((post) => post?.creator_wallet);
  requireCondition(Boolean(firstPost), "No post with creator_wallet found.");
  fixtures.selfPost = firstPost;

  const nonSelf = posts.find(
    (post) =>
      typeof post?.creator_wallet === "string" &&
      post.creator_wallet.toLowerCase() !== walletAddress,
  );
  requireCondition(Boolean(nonSelf), "No non-self post found for engagement payout checks.");
  fixtures.post = nonSelf;

  fixtures.track = tracks[0];
  requireCondition(Boolean(fixtures.track?.id), "No track id available.");
  return {
    post_id: fixtures.post.id,
    self_post_id: fixtures.selfPost.id,
    track_id: fixtures.track.id,
  };
});

await runCheck("Mog feed contract: items + next_cursor + has_more", true, async () => {
  const page1 = await invokeEdge("mog-feed", {
    body: { feed_type: "foryou", limit: 25 },
  });
  requireCondition(page1.status === 200, `mog-feed page1 status ${page1.status}`);
  requireCondition(Boolean(page1.json?.success), "mog-feed page1 success=false");
  requireCondition(Array.isArray(page1.json?.items), "mog-feed items missing");
  requireCondition(Object.prototype.hasOwnProperty.call(page1.json, "next_cursor"), "mog-feed next_cursor missing");
  requireCondition(Object.prototype.hasOwnProperty.call(page1.json, "has_more"), "mog-feed has_more missing");

  const page1Ids = new Set((page1.json.items || []).map((item) => item.id));
  requireCondition(page1Ids.size === page1.json.items.length, "mog-feed page1 contains duplicate IDs");

  const details = {
    page1_items: page1.json.items.length,
    page1_latency_ms: page1.latency_ms,
    has_more: page1.json.has_more,
  };

  if (page1.json.has_more) {
    requireCondition(Boolean(page1.json.next_cursor), "has_more=true but next_cursor is empty");
    const page2 = await invokeEdge("mog-feed", {
      body: { feed_type: "foryou", limit: 25, cursor: page1.json.next_cursor },
    });
    requireCondition(page2.status === 200, `mog-feed page2 status ${page2.status}`);
    requireCondition(Boolean(page2.json?.success), "mog-feed page2 success=false");
    const page2Ids = new Set((page2.json.items || []).map((item) => item.id));
    requireCondition(page2Ids.size === page2.json.items.length, "mog-feed page2 contains duplicate IDs");
    const overlap = (page2.json.items || []).filter((item) => page1Ids.has(item.id)).length;
    requireCondition(overlap === 0, `mog-feed cursor overlap detected (${overlap} duplicates)`);
    details.page2_items = page2.json.items.length;
    details.page2_latency_ms = page2.latency_ms;
  }

  return details;
});

let engagementProof = null;

await runCheck("Wallet proof: challenge generation succeeds", true, async () => {
  const challenge = await invokeEdge("wallet-proof", {
    body: { address: walletAddress, action: "engagement:like" },
  });
  requireCondition(challenge.status === 200, `wallet-proof challenge status ${challenge.status}`);
  requireCondition(Boolean(challenge.json?.success), "wallet-proof challenge success=false");
  requireCondition(Boolean(challenge.json?.challenge?.nonce), "wallet-proof nonce missing");
  requireCondition(Boolean(challenge.json?.challenge?.message), "wallet-proof message missing");

  engagementProof = {
    address: walletAddress,
    action: "engagement:like",
    nonce: challenge.json.challenge.nonce,
    message: challenge.json.challenge.message,
    signature: await wallet.signMessage(challenge.json.challenge.message),
  };

  return { nonce: challenge.json.challenge.nonce };
});

await runCheck("Wallet proof: invalid signature fails", true, async () => {
  const badProof = {
    ...engagementProof,
    nonce: `bad-${crypto.randomUUID()}`,
    signature: "0x1234",
  };
  const response = await invokeEdge("engagement-pay", {
    body: {
      content_type: "mog_post",
      content_id: fixtures.post.id,
      action_type: "like",
      payer_wallet: walletAddress,
      wallet_proof: badProof,
    },
  });
  requireCondition(response.status === 401, `Expected 401, got ${response.status}`);
  requireCondition(
    response.json?.error === "wallet_signature_invalid" ||
      response.json?.error === "wallet_signature_mismatch" ||
      response.json?.error === "wallet_nonce_not_found",
    `Unexpected error: ${response.json?.error || response.text}`,
  );
  return { error: response.json?.error };
});

await runCheck("Engagement payout: mog_post insert succeeds with wallet proof", true, async () => {
  const response = await invokeEdge("engagement-pay", {
    body: {
      content_type: "mog_post",
      content_id: fixtures.post.id,
      action_type: "like",
      payer_wallet: walletAddress,
      wallet_proof: engagementProof,
    },
  });
  requireCondition(response.status === 200, `engagement-pay status ${response.status}`);
  requireCondition(Boolean(response.json?.success), `engagement-pay failed: ${response.text}`);
  return {
    payout_id: response.json?.payout_id || null,
    amount: response.json?.amount || null,
  };
});

await runCheck("Wallet proof: nonce replay fails", true, async () => {
  const replay = await invokeEdge("engagement-pay", {
    body: {
      content_type: "mog_post",
      content_id: fixtures.post.id,
      action_type: "comment",
      payer_wallet: walletAddress,
      wallet_proof: engagementProof,
    },
  });
  requireCondition(replay.status === 401, `Expected 401 on replay, got ${replay.status}`);
  requireCondition(replay.json?.error === "wallet_nonce_already_used", `Unexpected replay error: ${replay.text}`);
  return { error: replay.json?.error };
});

await runCheck("Engagement payout: self-engagement is skipped", true, async () => {
  const selfWallet = String(fixtures.selfPost.creator_wallet).toLowerCase();
  const response = await invokeEdge("engagement-pay", {
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
    body: {
      content_type: "mog_post",
      content_id: fixtures.selfPost.id,
      action_type: "bookmark",
      payer_wallet: selfWallet,
    },
  });
  requireCondition(response.status === 200 || response.status === 403, `Unexpected status ${response.status}`);
  requireCondition(response.json?.error === "self_engagement_blocked", `Unexpected response: ${response.text}`);
  requireCondition(response.json?.skipped === true, "Expected skipped=true for self engagement");
  return { status: response.status };
});

await runCheck("x402 legacy: pay-stream creates session", true, async () => {
  const response = await invokeEdge("pay-stream", {
    body: {
      track_id: fixtures.track.id,
      payer_wallet: walletAddress,
      mode_preference: "legacy",
    },
  });
  requireCondition(response.status === 200, `pay-stream status ${response.status}`);
  requireCondition(Boolean(response.json?.success), `pay-stream failed: ${response.text}`);
  requireCondition(response.json?.mode_used === "legacy", `Expected legacy mode, got ${response.json?.mode_used}`);
  return {
    mode_used: response.json?.mode_used,
    stream_id: response.json?.stream?.stream_id || null,
  };
});

await runCheck("x402 restore: stream-session-active returns restore_source", true, async () => {
  const response = await invokeEdge("stream-session-active", {
    body: {
      track_id: fixtures.track.id,
      payer_wallet: walletAddress,
      mode_preference: "legacy",
    },
  });
  requireCondition(response.status === 200, `stream-session-active status ${response.status}`);
  requireCondition(Boolean(response.json?.success), `stream-session-active failed: ${response.text}`);
  requireCondition(
    response.json?.restore_source === "stream_sessions" || response.json?.restore_source === "music_streams",
    `Unexpected restore_source ${response.json?.restore_source}`,
  );
  return {
    mode_used: response.json?.mode_used,
    restore_source: response.json?.restore_source,
  };
});

await runCheck("Moltbook production verifier rejects mock tokens", true, async () => {
  const response = await invokeEdge("moltbook-auth", {
    headers: { "x-moltbook-identity": "mock_agent_1" },
  });
  requireCondition(response.status === 401, `Expected 401 for mock token, got ${response.status}`);
  requireCondition(response.json?.valid === false, "Expected valid=false for mock token");
  return { error: response.json?.error || null };
});

await runCheck("Bot autopilot: disabled state enforced", true, async () => {
  const response = await invokeEdge("bot-autopilot", {
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
    body: { max_jobs: 1 },
  });
  requireCondition(response.status === 403, `Expected 403, got ${response.status}`);
  requireCondition(response.json?.error === "bot_autopilot_disabled", `Unexpected response: ${response.text}`);
  return {};
});

let uploadWalletProof = null;

await runCheck("Upload article: wallet proof + article_body persisted", true, async () => {
  const challenge = await invokeEdge("wallet-proof", {
    body: { address: walletAddress, action: "mog_upload:article" },
  });
  requireCondition(challenge.status === 200, `wallet-proof upload challenge status ${challenge.status}`);

  uploadWalletProof = {
    address: walletAddress,
    action: "mog_upload:article",
    nonce: challenge.json.challenge.nonce,
    message: challenge.json.challenge.message,
    signature: await wallet.signMessage(challenge.json.challenge.message),
  };

  const articleBody = `Phase 4 acceptance test article ${new Date().toISOString()}`;
  const upload = await invokeEdge("mog-upload", {
    body: {
      content_type: "article",
      title: "Phase 4 Acceptance Article",
      description: "Acceptance gate upload check",
      article_body: articleBody,
      hashtags: ["phase4", "acceptance"],
      creator_wallet: walletAddress,
      wallet_proof: uploadWalletProof,
      creator_type: "human",
    },
  });

  requireCondition(upload.status === 201, `mog-upload status ${upload.status}`);
  requireCondition(Boolean(upload.json?.success), `mog-upload failed: ${upload.text}`);
  requireCondition(Boolean(upload.json?.data?.id), "mog-upload returned no post id");

  const inserted = await restGet("mog_posts", {
    select: "id,content_type,article_body",
    id: `eq.${upload.json.data.id}`,
    limit: "1",
  });
  requireCondition(Array.isArray(inserted) && inserted.length === 1, "Inserted article not found");
  requireCondition(inserted[0].content_type === "article", "Inserted content type is not article");
  requireCondition(Boolean(inserted[0].article_body), "Inserted article_body is empty");

  return { post_id: upload.json.data.id };
});

await runCheck("Upload validation: invalid content type rejected", true, async () => {
  const response = await invokeEdge("mog-upload", {
    body: {
      content_type: "gif",
      creator_wallet: walletAddress,
    },
  });
  requireCondition(response.status === 400, `Expected 400, got ${response.status}`);
  requireCondition(response.json?.error === "invalid_content_type", `Unexpected response: ${response.text}`);
  return {};
});

await runCheck("Upload validation: missing article body rejected", true, async () => {
  const response = await invokeEdge("mog-upload", {
    body: {
      content_type: "article",
      creator_wallet: walletAddress,
    },
  });
  requireCondition(response.status === 400, `Expected 400, got ${response.status}`);
  requireCondition(response.json?.error === "missing_article_body", `Unexpected response: ${response.text}`);
  return {};
});

const failed = checks.filter((check) => check.status === "fail");
const requiredFailures = failed.filter((check) => check.required);
const requiredSkips = checks.filter((check) => check.status === "skipped" && check.required);
const latencies = endpointCalls.map((call) => call.latency_ms);
const groupedLatency = endpointCalls.reduce((acc, call) => {
  const list = acc[call.endpoint] || [];
  list.push(call.latency_ms);
  acc[call.endpoint] = list;
  return acc;
}, {});

const endpointLatencyP95 = Object.entries(groupedLatency).map(([endpoint, values]) => ({
  endpoint,
  requests: values.length,
  p95_latency_ms: percentile(values, 95),
}));

let opsTopErrors = [];
try {
  const opsErrors = await restGet("ops_event_logs", {
    select: "component,event_name,metadata,created_at",
    level: "eq.error",
    order: "created_at.desc",
    limit: "250",
  });

  const counts = new Map();
  for (const row of opsErrors || []) {
    const key = `${row.component || "unknown"}:${row.event_name || "unknown"}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  opsTopErrors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }));
} catch {
  opsTopErrors = [];
}

const summary = {
  generated_at: new Date().toISOString(),
  staging_url: supabaseUrl,
  frontend_url: frontendUrl || null,
  wallet_used: walletAddress,
  totals: {
    checks: checks.length,
    passed: checks.filter((check) => check.status === "pass").length,
    failed: failed.length,
    required_failed: requiredFailures.length,
    required_skipped: requiredSkips.length,
  },
  endpoint_latency: {
    total_requests: endpointCalls.length,
    p95_ms: percentile(latencies, 95),
    by_endpoint: endpointLatencyP95,
  },
  top_errors: failed.slice(0, 5).map((check) => ({
    check: check.name,
    error: check.error,
  })),
  top_ops_errors: opsTopErrors,
  checks,
  pass: requiredFailures.length === 0 && requiredSkips.length === 0,
};

const jsonPath = path.join(memoryDir, `phase4-acceptance-report-${timestamp}.json`);
const mdPath = path.join(memoryDir, `phase4-acceptance-report-${timestamp}.md`);
fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

const markdown = [
  "# Phase 4 Acceptance Report",
  "",
  `- Generated: ${summary.generated_at}`,
  `- Supabase: ${summary.staging_url}`,
  `- Frontend: ${summary.frontend_url || "not_set"}`,
  `- Wallet: ${summary.wallet_used}`,
  `- Pass: ${summary.pass}`,
  "",
  "## Pass/Fail Matrix",
  "",
  "| Check | Required | Status | Duration (ms) |",
  "|---|---|---|---:|",
  ...checks.map((check) => `| ${check.name} | ${check.required} | ${check.status} | ${check.duration_ms} |`),
  "",
  "## Endpoint Latency p95",
  "",
  `- Global p95: ${summary.endpoint_latency.p95_ms ?? "n/a"} ms`,
  ...summary.endpoint_latency.by_endpoint.map(
    (row) => `- ${row.endpoint}: p95=${row.p95_latency_ms ?? "n/a"} ms (${row.requests} requests)`,
  ),
  "",
  "## Top Errors",
  "",
  ...(summary.top_errors.length > 0
    ? summary.top_errors.map((error, index) => `${index + 1}. ${error.check}: ${error.error}`)
    : ["- none"]),
  "",
  "## Top Ops Errors (ops_event_logs)",
  "",
  ...(summary.top_ops_errors.length > 0
    ? summary.top_ops_errors.map((entry) => `- ${entry.event}: ${entry.count}`)
    : ["- none"]),
  "",
].join("\n");

fs.writeFileSync(mdPath, `${markdown}\n`);

console.log(JSON.stringify(summary, null, 2));
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);

if (!summary.pass) {
  process.exitCode = 1;
}
