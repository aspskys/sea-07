#!/usr/bin/env node
/**
 * SeaInfra last-mile completion audit.
 * Machine-verifiable only — do not trust agent narrative.
 *
 * Usage:
 *   node verify-completion.mjs --env test
 *   node verify-completion.mjs --env test --json
 *   node verify-completion.mjs --mode ship --json
 *   node verify-completion.mjs --mode audit --env production
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const defaultRoot = path.resolve(skillRoot, "../../..");

const MODULES = [
  "llm",
  "multimodal",
  "content_safety",
  "data_sync",
  "tracking",
  "payment",
  "search_recommend",
  "ads_acquisition",
];

const DEPENDENCIES = {
  search_recommend: ["data_sync"],
};

const VAGUE_PATTERNS = [
  /^已检查$/,
  /^正常$/,
  /^通过$/,
  /^完成$/,
  /^ok$/i,
  /^okay$/i,
  /^passed$/i,
  /^pass$/i,
  /^done$/i,
  /^verified$/i,
  /^looks good$/i,
  /^lgtm$/i,
  /^agent 已验证$/,
  /^功能正常$/,
  /^无问题$/,
  /^已验证$/,
  /^checked$/i,
  /^works$/i,
  /^fine$/i,
];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function present(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function isVague(item) {
  const s = String(item).trim();
  if (s.length < 8) return true;
  return VAGUE_PATTERNS.some((re) => re.test(s));
}

function resolveRoot() {
  const rootArg = arg("--root");
  if (rootArg) return path.resolve(rootArg);
  // skill lives at <root>/.agents/skills/seainfra-completion-check
  return defaultRoot;
}

function managePath(root) {
  return path.join(
    root,
    ".agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs",
  );
}

function runValidate(root, module, env, phase = null) {
  const args = [managePath(root), "validate", module, "--env", env, "--root", root];
  if (phase) args.push("--phase", phase);
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  let missing = [];
  try {
    const parsed = JSON.parse((r.stdout || "").trim() || "{}");
    missing = parsed[module] || [];
  } catch {
    missing = r.status === 0 ? [] : ["validate_parse_error"];
  }
  return { ok: r.status === 0 && missing.length === 0, missing, status: r.status };
}

function auditEvidence(root, module, env, evidenceRel) {
  const failures = [];
  const warnings = [];
  if (!present(evidenceRel)) {
    failures.push("state.evidence missing");
    return { ok: false, failures, warnings, evidencePath: null };
  }
  const evidencePath = path.resolve(root, evidenceRel);
  if (!fs.existsSync(evidencePath)) {
    failures.push(`evidence file not found: ${evidenceRel}`);
    return { ok: false, failures, warnings, evidencePath };
  }
  let evidence;
  try {
    evidence = readJson(evidencePath);
  } catch (e) {
    failures.push(`evidence JSON invalid: ${e.message}`);
    return { ok: false, failures, warnings, evidencePath };
  }
  if (evidence.module !== module) {
    failures.push(`evidence.module=${evidence.module} != ${module}`);
  }
  if (evidence.environment !== env) {
    failures.push(`evidence.environment=${evidence.environment} != ${env}`);
  }
  if (evidence.result !== "passed") {
    failures.push(`evidence.result=${evidence.result} (need passed)`);
  }
  if (!Array.isArray(evidence.sourceRefs) || evidence.sourceRefs.length === 0) {
    failures.push("evidence.sourceRefs empty");
  }
  for (const layer of ["static", "connectivity", "e2e"]) {
    const check = evidence.checks?.[layer];
    if (!check) {
      failures.push(`checks.${layer} missing`);
      continue;
    }
    if (!["passed", "not_applicable"].includes(check.status)) {
      failures.push(`checks.${layer}.status invalid: ${check.status}`);
    }
    if (check.status === "not_applicable" && !present(check.reason)) {
      failures.push(`checks.${layer} not_applicable without reason`);
    }
    if (check.status === "passed") {
      if (!Array.isArray(check.evidence) || check.evidence.length === 0) {
        failures.push(`checks.${layer}.evidence empty`);
      } else {
        for (const item of check.evidence) {
          if (isVague(item)) {
            failures.push(
              `checks.${layer}.evidence too vague: ${JSON.stringify(String(item).slice(0, 40))}`,
            );
          }
        }
      }
    }
  }
  return { ok: failures.length === 0, failures, warnings, evidencePath, evidence };
}

function crossChecks(root, module, env, stateEntry, config, evidenceAudit) {
  const failures = [];
  const warnings = [];

  // tracking: packages must exist if completed
  if (module === "tracking" && stateEntry.status === "completed") {
    const conanScript = path.join(
      root,
      ".agents/skills/seainfra-tracking-client-integrate/scripts/check-conan.mjs",
    );
    if (fs.existsSync(conanScript)) {
      const r = spawnSync(process.execPath, [conanScript, "--json"], {
        encoding: "utf8",
        cwd: root,
      });
      try {
        const j = JSON.parse(r.stdout || "{}");
        const missing = j.apps?.[0]?.conanDeps?.missing || [];
        if (Array.isArray(missing) && missing.length > 0) {
          failures.push(
            `tracking completed but conan deps missing: ${missing.slice(0, 3).join(", ")}`,
          );
        }
        if (j.code === "none") {
          failures.push("tracking completed but check-conan code=none");
        }
      } catch {
        warnings.push("check-conan.mjs could not be parsed");
      }
    }
    if (!fs.existsSync(path.join(root, "node_modules/@seaart/conan-core"))) {
      // only hard-fail if client surface selected
      const surfaces = config.environments?.[env]?.tracking?.surfaces || [];
      if (surfaces.includes("client")) {
        failures.push(
          "tracking completed but node_modules/@seaart/conan-core missing",
        );
      }
    }
  }

  // payment: channel_check must cover channels
  if (module === "payment" && stateEntry.status === "completed") {
    const pay = config.environments?.[env]?.payment || {};
    const channels = pay.channels || [];
    const enabled = pay.channel_check?.enabled_channels || [];
    if (!pay.channel_check) {
      failures.push("payment completed but channel_check missing");
    } else {
      const missingCh = channels.filter((c) => !enabled.includes(c));
      if (missingCh.length) {
        failures.push(
          `payment completed but channels not enabled: ${missingCh.join(", ")}`,
        );
      }
    }
  }

  // search_recommend dependency
  for (const dep of DEPENDENCIES[module] || []) {
    // handled in main loop via state
  }

  // userAcceptedTestClosure is not completed
  if (
    stateEntry.userAcceptedTestClosure &&
    stateEntry.status === "completed" &&
    !evidenceAudit.ok
  ) {
    failures.push(
      "userAcceptedTestClosure cannot substitute for valid completed evidence",
    );
  }

  return { failures, warnings };
}

function auditEnvironment(root, env) {
  const configPath = path.join(root, ".agents/seainfra/config.json");
  const statePath = path.join(root, ".agents/seainfra/state.json");
  if (!fs.existsSync(configPath) || !fs.existsSync(statePath)) {
    fail("missing .agents/seainfra/config.json or state.json");
  }
  const config = readJson(configPath);
  const state = readJson(statePath);

  const modulesOut = [];
  const failures = [];
  const warnings = [];
  let selectedCount = 0;
  let completedOk = 0;
  let deferred = 0;
  let hasTestClosureFlag = Boolean(state.testProjectClosure);

  for (const module of MODULES) {
    const entry = state.modules?.[module];
    if (!entry?.selected) {
      modulesOut.push({
        module,
        selected: false,
        state: entry?.environments?.[env]?.status || "not_selected",
        evidenceAudit: "skip",
        failures: [],
        warnings: [],
      });
      continue;
    }
    selectedCount += 1;
    const st = entry.environments?.[env] || {
      status: "not_selected",
      evidence: null,
      blockers: [],
    };
    const modFailures = [];
    const modWarnings = [];

    // validate config
    const phase = module === "payment" && st.status === "completed" ? "check" : null;
    // always run integration validate; payment completed also needs check phase
    const v1 = runValidate(root, module, env, "integration");
    if (!v1.ok) {
      // For non-completed modules, validate fail is expected sometimes — record as gap not always failure for audit mode
      if (st.status === "completed") {
        modFailures.push(`validate integration: ${v1.missing.join(", ")}`);
      } else {
        modWarnings.push(`validate integration incomplete: ${v1.missing.join(", ") || "exit " + v1.status}`);
      }
    }
    if (module === "payment" && (st.status === "completed" || st.status === "checking")) {
      const v2 = runValidate(root, module, env, "check");
      if (!v2.ok) {
        modFailures.push(`validate payment check: ${v2.missing.join(", ")}`);
      }
    }

    // dependencies
    for (const dep of DEPENDENCIES[module] || []) {
      const depStatus =
        state.modules?.[dep]?.environments?.[env]?.status || "not_selected";
      if (st.status === "completed" && depStatus !== "completed") {
        modFailures.push(`dependency ${dep} is ${depStatus}, need completed`);
      } else if (st.status !== "completed" && depStatus !== "completed") {
        modWarnings.push(`dependency ${dep} not completed (${depStatus})`);
      }
    }

    let evidenceAudit = "skip";
    let evidenceResult = { ok: true, failures: [], warnings: [] };

    if (st.status === "completed") {
      evidenceResult = auditEvidence(root, module, env, st.evidence);
      evidenceAudit = evidenceResult.ok ? "pass" : "fail";
      modFailures.push(...evidenceResult.failures);
      modWarnings.push(...(evidenceResult.warnings || []));
      const cross = crossChecks(
        root,
        module,
        env,
        st,
        config,
        evidenceResult,
      );
      modFailures.push(...cross.failures);
      modWarnings.push(...cross.warnings);
      if (evidenceResult.ok && cross.failures.length === 0 && v1.ok) {
        // payment check phase already folded into modFailures
        const payCheckOk =
          module !== "payment" ||
          !modFailures.some((f) => f.startsWith("validate payment check"));
        if (payCheckOk && modFailures.length === 0) completedOk += 1;
      }
    } else if (st.userAcceptedTestClosure || st.userDeferredTo) {
      deferred += 1;
      hasTestClosureFlag = true;
      evidenceAudit = "n/a";
      modWarnings.push(
        st.userDeferredTo
          ? `deferred to ${st.userDeferredTo}`
          : "userAcceptedTestClosure (not formal completed)",
      );
    } else if (["blocked", "integrating", "checking", "selected"].includes(st.status)) {
      evidenceAudit = "n/a";
      if ((st.blockers || []).length) {
        modWarnings.push(`blockers: ${(st.blockers || []).slice(0, 2).join(" | ")}`);
      } else {
        modWarnings.push(`status=${st.status} not completed`);
      }
    }

    if (modFailures.length) {
      failures.push(...modFailures.map((f) => `${module}: ${f}`));
    }
    warnings.push(...modWarnings.map((w) => `${module}: ${w}`));

    modulesOut.push({
      module,
      selected: true,
      state: st.status,
      evidence: st.evidence || null,
      evidenceAudit,
      failures: modFailures,
      warnings: modWarnings,
      blockers: st.blockers || [],
      userAcceptedTestClosure: Boolean(st.userAcceptedTestClosure),
      userDeferredTo: st.userDeferredTo || null,
    });
  }

  // env_ready: all selected completed with clean audit
  const selectedModules = modulesOut.filter((m) => m.selected);
  const allCompletedClean = selectedModules.every(
    (m) => m.state === "completed" && m.evidenceAudit === "pass" && m.failures.length === 0,
  );

  let verdict = "not_ready";
  if (allCompletedClean && selectedCount > 0) {
    verdict = "env_ready";
  } else if (hasTestClosureFlag || selectedModules.some((m) => m.userAcceptedTestClosure || m.userDeferredTo)) {
    // test closure only if nothing falsely completed
    const falseCompleted = selectedModules.some(
      (m) => m.state === "completed" && m.failures.length > 0,
    );
    verdict = falseCompleted ? "not_ready" : "test_closure";
  }

  // If any completed module failed audit, never env_ready
  if (selectedModules.some((m) => m.state === "completed" && m.failures.length > 0)) {
    verdict = "not_ready";
  }

  let nextAction = "无";
  if (verdict === "env_ready") {
    nextAction = "该环境全部 selected 模块证据审计通过；可宣称 env_ready。上线请再跑 --mode ship。";
  } else if (verdict === "test_closure") {
    nextAction =
      "测试收口可暂停；不得宣称 formal 完成。正式项目按 failures/warnings 重跑对应 *-check。";
  } else {
    const first = selectedModules.find(
      (m) => m.failures.length || (m.state !== "completed" && !m.userDeferredTo && !m.userAcceptedTestClosure),
    );
    if (first?.failures?.length) {
      nextAction = `修复 ${first.module}: ${first.failures[0]}；然后跑 seainfra-${first.module}-check`;
    } else if (first) {
      nextAction = `继续 ${first.module}（status=${first.state}）→ check-start + 配对 Check Skill`;
    } else {
      nextAction = "查看 modules[].warnings 并补齐 blocked 依赖";
    }
  }

  return {
    verdict,
    environment: env,
    selectedCount,
    completedOk,
    deferred,
    modules: modulesOut,
    failures,
    warnings,
    nextAction,
    testProjectClosure: state.testProjectClosure || null,
  };
}

function main() {
  const root = resolveRoot();
  const mode = arg("--mode", "audit"); // audit | env | ship
  const env = arg("--env", "test");
  const asJson = hasFlag("--json");

  if (!["audit", "env", "ship"].includes(mode)) {
    fail("mode must be audit|env|ship");
  }
  if (!["test", "production"].includes(env) && mode !== "ship") {
    fail("env must be test|production");
  }

  let report;
  if (mode === "ship") {
    const testR = auditEnvironment(root, "test");
    const prodR = auditEnvironment(root, "production");
    const shipReady =
      testR.verdict === "env_ready" && prodR.verdict === "env_ready";
    report = {
      mode: "ship",
      verdict: shipReady ? "ship_ready" : "not_ready",
      test: testR,
      production: prodR,
      failures: [
        ...testR.failures.map((f) => `test: ${f}`),
        ...prodR.failures.map((f) => `production: ${f}`),
      ],
      warnings: [
        ...testR.warnings.map((w) => `test: ${w}`),
        ...prodR.warnings.map((w) => `production: ${w}`),
      ],
      nextAction: shipReady
        ? "test+production 均为 env_ready，可按上线清单发布。"
        : "先使 test 与 production 均 env_ready；见 test/production.nextAction",
    };
  } else {
    const r = auditEnvironment(root, env);
    report = {
      mode,
      ...r,
      // env mode: fail exit if not env_ready
    };
    if (mode === "env" && r.verdict !== "env_ready") {
      // keep verdict
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`SeaInfra completion audit`);
    console.log(`root: ${root}`);
    console.log(`mode: ${report.mode}  verdict: ${report.verdict}`);
    if (report.environment) {
      console.log(
        `env: ${report.environment}  selected: ${report.selectedCount}  completed_ok: ${report.completedOk}  deferred: ${report.deferred}`,
      );
    }
    if (report.modules) {
      console.log("\nModule table:");
      for (const m of report.modules.filter((x) => x.selected)) {
        console.log(
          `  - ${m.module}: state=${m.state} evidence=${m.evidenceAudit}` +
            (m.failures.length ? ` FAIL:${m.failures[0]}` : "") +
            (m.warnings[0] ? ` (${m.warnings[0]})` : ""),
        );
      }
    }
    if (report.test) {
      console.log(`\ntest: ${report.test.verdict}`);
      console.log(`production: ${report.production.verdict}`);
    }
    if (report.failures?.length) {
      console.log("\nFailures:");
      for (const f of report.failures.slice(0, 30)) console.log(`  × ${f}`);
    }
    if (report.warnings?.length) {
      console.log("\nWarnings:");
      for (const w of report.warnings.slice(0, 20)) console.log(`  ! ${w}`);
    }
    console.log(`\nNext: ${report.nextAction}`);
  }

  // exit codes:
  // 0 = mode satisfied
  // 1 = not ready (expected)
  // 2 = tool error
  if (mode === "audit") {
    // audit always 0 if script ran; false completed is still exit 1 to flag lies
    const falseCompleted =
      report.failures?.some((f) => String(f).includes("completed")) ||
      report.modules?.some((m) => m.state === "completed" && m.failures.length > 0);
    process.exit(falseCompleted ? 1 : 0);
  }
  if (mode === "env") {
    process.exit(report.verdict === "env_ready" ? 0 : 1);
  }
  if (mode === "ship") {
    process.exit(report.verdict === "ship_ready" ? 0 : 1);
  }
}

main();
