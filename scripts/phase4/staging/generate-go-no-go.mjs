import fs from "node:fs";
import path from "node:path";

const memoryDir = path.join(process.cwd(), "memory");
fs.mkdirSync(memoryDir, { recursive: true });

function latestReport(prefix) {
  const files = fs
    .readdirSync(memoryDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  return path.join(memoryDir, files[files.length - 1]);
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const acceptancePath = process.env.ACCEPTANCE_REPORT || latestReport("phase4-acceptance-report-");
const canaryPath = process.env.CANARY_REPORT || latestReport("phase4-canary-report-");
const rollbackEvidence = process.env.ROLLBACK_EVIDENCE_FILE || "";

const acceptance = readJson(acceptancePath);
const canary = readJson(canaryPath);

if (!acceptance) {
  console.error("No acceptance report found. Run scripts/phase4/staging/acceptance-gate.mjs first.");
  process.exit(1);
}

const blockers = [];
if (!acceptance.pass) {
  blockers.push("Acceptance gate failed.");
}
if (!canary) {
  blockers.push("Canary report missing.");
} else if (!canary.pass) {
  blockers.push("Canary gates failed.");
}
if (!rollbackEvidence) {
  blockers.push("Rollback evidence file not provided.");
}

const status = blockers.length === 0 ? "GO" : "NO_GO";
const generatedAt = new Date().toISOString();
const outputPath = path.join(
  memoryDir,
  `phase4-go-no-go-${generatedAt.replace(/[:.]/g, "-")}.md`,
);

const lines = [
  "# Phase 4 Go/No-Go Checklist",
  "",
  `- Generated: ${generatedAt}`,
  `- Status: ${status}`,
  `- Acceptance report: ${acceptancePath || "missing"}`,
  `- Canary report: ${canaryPath || "missing"}`,
  `- Rollback evidence: ${rollbackEvidence || "missing"}`,
  "",
  "## Explicit Blockers",
  "",
];

if (blockers.length === 0) {
  lines.push("- none");
} else {
  for (const blocker of blockers) {
    lines.push(`- ${blocker}`);
  }
}

lines.push("");
lines.push("## Evidence Snapshot");
lines.push("");
lines.push(`- Acceptance required_failed: ${acceptance?.totals?.required_failed ?? "n/a"}`);
lines.push(`- Acceptance required_skipped: ${acceptance?.totals?.required_skipped ?? "n/a"}`);
if (canary) {
  lines.push(`- Canary gateway_success_rate: ${Number(canary?.metrics?.gateway_success_rate || 0).toFixed(2)}%`);
  lines.push(`- Canary fallback_rate: ${Number(canary?.metrics?.fallback_rate || 0).toFixed(2)}%`);
  lines.push(`- Canary restore_regressions: ${canary?.metrics?.restore_regressions ?? "n/a"}`);
}

lines.push("");
lines.push("## Production Cutover Sequence");
lines.push("");
lines.push("1. Confirm all staging gates remain green within the final 2-hour pre-cut window.");
lines.push("2. Apply production env values for approved phase toggles.");
lines.push("3. Deploy edge functions with identical build artifacts used in staging validation.");
lines.push("4. Run smoke checks for feed, upload, payout, stream pay/restore, and Moltbook auth.");
lines.push("5. Watch first-hour dashboards for error spikes, fallback spikes, and restore regressions.");
lines.push("6. Trigger rollback immediately if fallback or error thresholds breach runbook limits.");
lines.push("");

fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${outputPath}`);
console.log(`Status: ${status}`);

if (status !== "GO") {
  process.exitCode = 1;
}
