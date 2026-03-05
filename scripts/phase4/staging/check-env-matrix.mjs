import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const memoryDir = path.join(root, "memory");
fs.mkdirSync(memoryDir, { recursive: true });

const frontendDefaults = {
  VITE_X402_MODE: "legacy",
  VITE_MOLTBOOK_MODE: "development",
  VITE_MOLTBOOK_ALLOW_MOCK: "true",
};

const edgeDefaults = {
  X402_MODE: "legacy",
  MOLTBOOK_MODE: "production",
  MOLTBOOK_ALLOW_MOCK: "false",
  BOT_AUTOPILOT_ENABLED: "false",
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equal = trimmed.indexOf("=");
    if (equal <= 0) continue;
    const key = trimmed.slice(0, equal).trim();
    const value = trimmed.slice(equal + 1).trim().replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function checkMatrix(sourceName, source, expected) {
  const checks = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = source[key];
    checks.push({
      key,
      expected: expectedValue,
      actual: actual ?? null,
      pass: normalize(actual) === normalize(expectedValue),
    });
  }
  const passed = checks.filter((check) => check.pass).length;
  return {
    source: sourceName,
    total: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
  };
}

const frontendFile = process.env.FRONTEND_ENV_FILE || path.join(root, "scripts/phase4/staging/frontend.staging.env.example");
const edgeFile = process.env.EDGE_ENV_FILE || path.join(root, "scripts/phase4/staging/edge.staging.env.example");

const frontendSource = {
  ...frontendDefaults,
  ...parseEnvFile(frontendFile),
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("VITE_"))),
};

const edgeSource = {
  ...edgeDefaults,
  ...parseEnvFile(edgeFile),
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ["X402_MODE", "MOLTBOOK_MODE", "MOLTBOOK_ALLOW_MOCK", "BOT_AUTOPILOT_ENABLED"].includes(key),
    ),
  ),
};

const frontend = checkMatrix("frontend", frontendSource, frontendDefaults);
const edge = checkMatrix("edge", edgeSource, edgeDefaults);
const nodeMajor = Number(process.versions.node.split(".")[0] || 0);
const nodeLtsRecommended = nodeMajor === 22;

const report = {
  generated_at: new Date().toISOString(),
  node_version: process.versions.node,
  node_22_recommended: nodeLtsRecommended,
  frontend,
  edge,
  passed: frontend.failed === 0 && edge.failed === 0,
};

const outputPath = path.join(memoryDir, `phase4-env-matrix-${timestamp}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${outputPath}`);

if (!nodeLtsRecommended) {
  console.warn("Warning: Node 22 LTS is recommended for local/staging validation.");
}

if (!report.passed) {
  process.exitCode = 1;
}
