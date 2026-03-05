import fs from "node:fs";
import path from "node:path";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const memoryDir = path.join(process.cwd(), "memory");
fs.mkdirSync(memoryDir, { recursive: true });

const supabaseUrl = (process.env.STAGING_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = process.env.STAGING_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const canaryWallets = (process.env.X402_CANARY_WALLETS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing STAGING_SUPABASE_URL/SUPABASE_URL or STAGING_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (canaryWallets.length === 0) {
  console.error("Missing X402_CANARY_WALLETS. Provide up to 5 comma-separated wallet addresses.");
  process.exit(1);
}

if (canaryWallets.length > 5) {
  console.error(`Canary cohort exceeded: got ${canaryWallets.length}, max is 5.`);
  process.exit(1);
}

const restBase = `${supabaseUrl}/rest/v1`;
const lookbackHours = Number(process.env.CANARY_LOOKBACK_HOURS || "24");
const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

async function restGet(table, params = {}) {
  const url = new URL(`${restBase}/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
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

const rows = await restGet("ops_event_logs", {
  select: "event_name,mode_used,restore_source,outcome,metadata,created_at",
  created_at: `gte.${since}`,
  order: "created_at.desc",
  limit: "5000",
});

const canaryRows = rows.filter((row) => {
  const wallet = String(row?.metadata?.wallet || row?.metadata?.payer_wallet || "").toLowerCase();
  return canaryWallets.includes(wallet);
});

const streamEvents = canaryRows.filter((row) =>
  ["pay_stream_success", "pay_stream_gateway_failed", "pay_stream_gateway_mode_failed"].includes(String(row.event_name)),
);

const restoreEvents = canaryRows.filter((row) => String(row.event_name) === "stream_session_restore");

const gatewaySuccess = streamEvents.filter(
  (row) => String(row.event_name) === "pay_stream_success" && String(row.mode_used) === "gateway",
).length;
const fallbackCount = streamEvents.filter(
  (row) =>
    String(row.event_name) === "pay_stream_success" &&
    String(row.mode_used) === "legacy" &&
    Boolean(row?.metadata?.fallback_from_gateway || row?.metadata?.fallback_used),
).length;
const totalAttempts = streamEvents.length;
const restoreRegressions = restoreEvents.filter((row) => String(row.outcome) === "error").length;

const gatewaySuccessRate = totalAttempts > 0 ? (gatewaySuccess / totalAttempts) * 100 : 0;
const fallbackRate = totalAttempts > 0 ? (fallbackCount / totalAttempts) * 100 : 0;

const gates = {
  gateway_success_rate_gte_95: gatewaySuccessRate >= 95,
  fallback_rate_lte_10: fallbackRate <= 10,
  restore_regressions_zero: restoreRegressions === 0,
};

const report = {
  generated_at: new Date().toISOString(),
  lookback_hours: lookbackHours,
  since,
  canary_wallets: canaryWallets,
  sample_sizes: {
    all_rows: rows.length,
    canary_rows: canaryRows.length,
    stream_events: streamEvents.length,
    restore_events: restoreEvents.length,
  },
  metrics: {
    gateway_success,
    fallback_count: fallbackCount,
    total_attempts: totalAttempts,
    gateway_success_rate,
    fallback_rate: fallbackRate,
    restore_regressions: restoreRegressions,
  },
  gates,
  pass: Object.values(gates).every(Boolean),
};

const jsonPath = path.join(memoryDir, `phase4-canary-report-${timestamp}.json`);
const mdPath = path.join(memoryDir, `phase4-canary-report-${timestamp}.md`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# Phase 4 Canary Metrics",
  "",
  `- Generated: ${report.generated_at}`,
  `- Lookback hours: ${report.lookback_hours}`,
  `- Wallet cohort size: ${report.canary_wallets.length}`,
  `- Pass: ${report.pass}`,
  "",
  "## Metrics",
  "",
  `- Gateway success rate: ${report.metrics.gateway_success_rate.toFixed(2)}%`,
  `- Fallback rate: ${report.metrics.fallback_rate.toFixed(2)}%`,
  `- Restore regressions: ${report.metrics.restore_regressions}`,
  `- Total attempts: ${report.metrics.total_attempts}`,
  "",
  "## Gates",
  "",
  `- gateway_success_rate_gte_95: ${report.gates.gateway_success_rate_gte_95}`,
  `- fallback_rate_lte_10: ${report.gates.fallback_rate_lte_10}`,
  `- restore_regressions_zero: ${report.gates.restore_regressions_zero}`,
  "",
].join("\n");

fs.writeFileSync(mdPath, `${markdown}\n`);

console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);

if (!report.pass) {
  process.exitCode = 1;
}
