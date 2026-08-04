#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const rootArgIndex = args.indexOf("--root");
if (rootArgIndex >= 0 && !args[rootArgIndex + 1]) {
  process.stderr.write("Usage: check-starunion-server.mjs [--json] [--root <path>]\n");
  process.exit(2);
}
const root = path.resolve(rootArgIndex >= 0 ? args[rootArgIndex + 1] : process.cwd());

const ignoredDirs = new Set([
  ".agents", ".codex", ".git", ".next", ".nuxt", ".output", ".turbo", ".venv", "build",
  "coverage", "dist", "node_modules", "target", "vendor"
]);
const textExtensions = new Set([
  ".c", ".cc", ".conf", ".config", ".cpp", ".cs", ".env", ".ex", ".exs",
  ".go", ".gradle", ".h", ".hpp", ".ini", ".java", ".js", ".json", ".kt",
  ".kts", ".mjs", ".php", ".properties", ".py", ".rb", ".rs", ".scala",
  ".sh", ".toml", ".ts", ".tsx", ".xml", ".yaml", ".yml"
]);
const manifestNames = new Map([
  ["go.mod", "go"], ["package.json", "javascript/typescript"],
  ["pom.xml", "java/kotlin"], ["build.gradle", "java/kotlin"],
  ["build.gradle.kts", "java/kotlin"], ["pyproject.toml", "python"],
  ["requirements.txt", "python"], ["Pipfile", "python"],
  ["Cargo.toml", "rust"], ["composer.json", "php"], ["Gemfile", "ruby"],
  ["mix.exs", "elixir"]
]);

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(full, files);
      continue;
    }
    if (entry.isFile()) files.push(full);
  }
  return files;
}

function relative(file) {
  const value = path.relative(root, file);
  return value || ".";
}

function isTextCandidate(file) {
  const base = path.basename(file);
  if (/lock\.(?:json|yaml|yml)$/i.test(base) || base.endsWith(".lock")) return false;
  return textExtensions.has(path.extname(file).toLowerCase()) ||
    manifestNames.has(base) || base.startsWith(".env") || base === "Dockerfile";
}

function readText(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 1024 * 1024) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const files = walk(root);
const manifests = [];
for (const file of files) {
  const base = path.basename(file);
  let language = manifestNames.get(base);
  if (!language && file.endsWith(".csproj")) language = "dotnet";
  if (!language) continue;
  const dir = path.dirname(file);
  let role = "service-candidate";
  if (base === "package.json") {
    try {
      const pkg = JSON.parse(readText(file));
      const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
      const scripts = Object.values(pkg.scripts || {}).join(" ");
      const hasServerDependency = Object.keys(dependencies).some((name) =>
        /^(?:@nestjs\/|express$|fastify$|hapi$|koa$|hono$|next$|restify$)/.test(name)
      );
      const hasServerDirectory = ["src/app/api", "app/api", "pages/api", "src/pages/api", "src/server", "server"].some((candidate) =>
        fs.existsSync(path.join(dir, candidate))
      );
      const onlyDelegatesToWorkspace = /(?:pnpm|npm|yarn).{0,20}(?:--filter|workspace)/.test(scripts) &&
        !hasServerDependency && !hasServerDirectory;
      const hasRuntimeScript = /(?:^|\s)(?:node|tsx|ts-node|next|nest)\b/.test(scripts);
      if (onlyDelegatesToWorkspace) role = "workspace-root";
      else if (!hasServerDependency && !hasServerDirectory && !hasRuntimeScript) role = "library-or-unknown";
    } catch {
      role = "unknown";
    }
  }
  manifests.push({ dir: relative(dir), manifest: relative(file), language, role });
}

const patterns = {
  sdk: /starunion[-_/ ]?sdk[-_/ ]?(?:go|java|kotlin|python|node|php|ruby|rust|dotnet|server)|SetLogUpload|SrvConsumer|LogUpload\.(?:SendEvent|SendUser)/i,
  http: /\/server\/collector\/(?:event|user)|Xh-Secret-Id|Xh-Aes-Iv|Xh-Sign/i,
  eventCall: /log_[a-z0-9_]+_server\b|LogUpload\.SendEvent\s*\(|SendEvent\s*\(/i,
  userCall: /\/server\/collector\/user|SendUser\s*\(|user_set_once|user_set/i,
  config: /\b(?:SERVER_STARUNION|STARUNION_SERVER|STARRY_SERVER|STARUNION_(?:AES|SECRET|CONFIG|HOST)|STARRY_(?:AES|SECRET|CONFIG|HOST))/i,
  backup: /LogPath|backup[_ -]?log|starunion.{0,40}(?:backup|retry)|(?:backup|retry).{0,40}starunion/i,
  lifecycle: /starunion.{0,60}(?:flush|close|shutdown)|(?:flush|close|shutdown).{0,60}starunion/i
};
const evidence = Object.fromEntries(Object.keys(patterns).map((key) => [key, []]));

for (const file of files) {
  if (!isTextCandidate(file)) continue;
  const content = readText(file);
  if (!content) continue;
  for (const [key, regex] of Object.entries(patterns)) {
    if (regex.test(content)) evidence[key].push(relative(file));
  }
}
for (const key of Object.keys(evidence)) evidence[key] = uniqueSorted(evidence[key]);

function deriveState(items) {
  const transport = items.sdk.length && items.http.length
    ? "mixed"
    : items.sdk.length
      ? "sdk"
      : items.http.length
        ? "http"
        : "none";
  const hasCalls = items.eventCall.length > 0 || items.userCall.length > 0;
  const code = transport !== "none" && hasCalls
    ? "full"
    : transport !== "none" || hasCalls
      ? "partial"
      : "none";
  return { code, config: items.config.length > 0 ? "ready" : "unknown", transport, hasCalls };
}

function missingFor(state, items) {
  const values = [];
  if (state.code === "partial" && state.transport === "none") values.push("未发现 SDK 或 HTTP collector 传输实现");
  if (state.code === "partial" && !state.hasCalls) values.push("未发现事件或用户属性调用点");
  if (state.code !== "none" && !items.backup.length) values.push("未发现持久化备份证据");
  if (state.code !== "none" && !items.lifecycle.length) values.push("未发现 flush/close/优雅退出证据");
  return values;
}

let serviceManifests = manifests.filter((item) => item.role === "service-candidate");
if (!serviceManifests.length) serviceManifests = manifests.filter((item) => item.role !== "workspace-root");
const services = serviceManifests.map((item) => {
  const serviceEvidence = Object.fromEntries(Object.entries(evidence).map(([key, values]) => [
    key,
    values.filter((file) =>
      item.dir === "." || file === item.dir || file.startsWith(`${item.dir}/`)
    )
  ]));
  const state = deriveState(serviceEvidence);
  return {
    ...item,
    code: state.code,
    config: state.config,
    transport: state.transport,
    missing: missingFor(state, serviceEvidence),
    trackingEvidence: uniqueSorted(Object.values(serviceEvidence).flat()).filter((file) =>
    item.dir === "." || file === item.dir || file.startsWith(`${item.dir}/`)
    )
  };
});
const globalState = deriveState(evidence);
if (!services.length && globalState.code !== "none") {
  services.push({
    dir: ".",
    manifest: null,
    language: "unknown",
    role: "unknown",
    code: globalState.code,
    config: globalState.config,
    transport: globalState.transport,
    missing: missingFor(globalState, evidence),
    trackingEvidence: uniqueSorted(Object.values(evidence).flat())
  });
}

const serviceCodes = services.map((service) => service.code);
const code = !serviceCodes.length
  ? globalState.code
  : serviceCodes.every((value) => value === "none")
    ? "none"
    : serviceCodes.every((value) => value === "full")
      ? "full"
      : "partial";
const activeTransports = uniqueSorted(services.map((service) => service.transport).filter((value) => value !== "none"));
const transport = activeTransports.length > 1 ? "mixed" : activeTransports[0] || globalState.transport;
const config = services.length && services.every((service) => service.config === "ready") ? "ready" : "unknown";
const missing = uniqueSorted(services.flatMap((service) => service.missing));

const warnings = [];
if (services.length > 1) warnings.push({ confidence: "low", message: "发现多个服务候选，修改前需确认目标服务。" });
if (services.some((service) => service.language === "unknown")) warnings.push({ confidence: "low", message: "无法从清单识别语言，需手工复核服务入口。" });
if (code === "full") warnings.push({ confidence: "low", message: "full 只表示发现传输与调用文本证据，必须复核初始化、调用链和运行验收。" });
if (config === "unknown" && code !== "none") warnings.push({ confidence: "low", message: "仓库未确认运行配置；配置可能由部署平台注入。" });

const result = {
  root,
  services,
  manifests,
  code,
  config,
  transport,
  evidence,
  missing,
  warnings
};

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`StarUnion server audit: code=${code}, config=${config}, transport=${transport}\n`);
  process.stdout.write(`Service candidates: ${services.length}\n`);
  for (const item of missing) process.stdout.write(`Missing: ${item}\n`);
  for (const item of warnings) process.stdout.write(`Warning (${item.confidence}): ${item.message}\n`);
}
