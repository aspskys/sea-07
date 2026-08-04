#!/usr/bin/env node
/**
 * SeaInfra last-mile completion audit (machine-verifiable only).
 *
 * Usage:
 *   node verify-completion.mjs --env test
 *   node verify-completion.mjs --env test --json
 *   node verify-completion.mjs --mode env --env test
 *   node verify-completion.mjs --mode ship --json
 *   node verify-completion.mjs --mode deep --env test --json
 *   node verify-completion.mjs --mode deep --live --env test   # real network probes when creds exist
 *   node verify-completion.mjs --env test --fix-false-completed
 *   node verify-completion.mjs --env test --write-report .agents/seainfra/evidence/completion-last.json
 *
 * Exit codes:
 *   0 = mode satisfied (audit: no false completed; env: env_ready; ship: ship_ready; deep: no deep failures on completed)
 *   1 = not ready / integrity failure
 *   2 = tool/usage error
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

const CHECK_SKILL = {
  llm: "seainfra-llm-check",
  multimodal: "seainfra-multimodal-check",
  content_safety: "seainfra-content-safety-check",
  data_sync: "seainfra-data-sync-check",
  tracking: "seainfra-tracking-check",
  payment: "seainfra-payment-check",
  search_recommend: "seainfra-search-recommend-check",
  ads_acquisition: "seainfra-ads-acquisition-check",
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function present(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

/** Prefer first existing path (supports monorepos like demo-x/project). */
function firstExisting(root, candidates) {
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return { rel, abs };
  }
  return null;
}

function isVague(item) {
  const s = String(item).trim();
  if (s.length < 8) return true;
  return VAGUE_PATTERNS.some((re) => re.test(s));
}

function resolveRoot() {
  const rootArg = arg("--root");
  if (rootArg) return path.resolve(rootArg);
  return defaultRoot;
}

function managePath(root) {
  return path.join(
    root,
    ".agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs",
  );
}

function runNode(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd,
    env: process.env,
  });
}

function runValidate(root, module, env, phase = null) {
  const args = [
    managePath(root),
    "validate",
    module,
    "--env",
    env,
    "--root",
    root,
  ];
  if (phase) args.push("--phase", phase);
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  let missing = [];
  try {
    const parsed = JSON.parse((r.stdout || "").trim() || "{}");
    missing = parsed[module] || [];
  } catch {
    missing = r.status === 0 ? [] : ["validate_parse_error"];
  }
  return {
    ok: r.status === 0 && missing.length === 0,
    missing,
    status: r.status,
  };
}

function runBlock(root, module, env, reason) {
  const clipped = String(reason).slice(0, 400);
  const r = spawnSync(
    process.execPath,
    [
      managePath(root),
      "block",
      module,
      "--env",
      env,
      "--root",
      root,
      "--reason",
      clipped,
    ],
    { encoding: "utf8" },
  );
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
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

function crossChecks(root, module, env, stateEntry, config) {
  const failures = [];
  const warnings = [];

  if (module === "tracking" && stateEntry.status === "completed") {
    const conanScript = path.join(
      root,
      ".agents/skills/seainfra-tracking-client-integrate/scripts/check-conan.mjs",
    );
    if (fs.existsSync(conanScript)) {
      const r = runNode(conanScript, ["--json"], root);
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
    const surfaces = config.environments?.[env]?.tracking?.surfaces || [];
    if (
      surfaces.includes("client") &&
      !fs.existsSync(path.join(root, "node_modules/@seaart/conan-core"))
    ) {
      failures.push(
        "tracking completed but node_modules/@seaart/conan-core missing",
      );
    }
  }

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

  return { failures, warnings };
}

/**
 * Mechanical deep re-probes (no LLM). Live network only with --live.
 */
function deepProbeModule(root, module, env, config, options) {
  const { live } = options;
  const results = [];
  const failures = [];
  const warnings = [];
  const agentChecklist = [];

  const push = (name, ok, detail) => {
    results.push({ name, ok, detail });
    if (!ok) failures.push(`deep:${name}: ${detail}`);
  };

  // Always: validate integration
  const v = runValidate(root, module, env, "integration");
  push(
    "validate_integration",
    v.ok,
    v.ok ? "ok" : `missing ${v.missing.join(", ")}`,
  );

  if (module === "payment") {
    const vc = runValidate(root, module, env, "check");
    push(
      "validate_payment_check",
      vc.ok,
      vc.ok ? "ok" : `missing ${vc.missing.join(", ")}`,
    );
  }

  if (module === "data_sync") {
    const script = path.join(
      root,
      ".agents/skills/seainfra-data-sync-check/scripts/check-data-sync.mjs",
    );
    if (fs.existsSync(script)) {
      const r = runNode(script, ["--root", root, "--json"], root);
      let ok = r.status === 0;
      let detail = `exit ${r.status}`;
      try {
        const j = JSON.parse(r.stdout || "{}");
        // script may print summary object
        if (j.ok === false || j.errors?.length) {
          ok = false;
          detail = JSON.stringify(j.errors || j).slice(0, 200);
        } else if (j.ok === true) {
          ok = true;
          detail = "check-data-sync ok";
        } else {
          // heuristic: invalid mappings
          if (j.invalidMappings?.length || j.unresolvedConfig?.length) {
            ok = false;
            detail = "mapping/config issues";
          } else if (r.status === 0) {
            ok = true;
            detail = "check-data-sync exit 0";
          }
        }
      } catch {
        ok = r.status === 0;
        detail = (r.stdout || r.stderr || "").slice(0, 120) || detail;
      }
      push("check_data_sync_script", ok, detail);
    } else {
      warnings.push("check-data-sync.mjs missing");
    }
    agentChecklist.push("seainfra-data-sync-check (warehouse freshness / CDC)");
  }

  if (module === "tracking") {
    const conan = path.join(
      root,
      ".agents/skills/seainfra-tracking-client-integrate/scripts/check-conan.mjs",
    );
    const server = path.join(
      root,
      ".agents/skills/seainfra-tracking-server-integrate/scripts/check-starunion-server.mjs",
    );
    const surfaces = config.environments?.[env]?.tracking?.surfaces || [];
    if (surfaces.includes("client") && fs.existsSync(conan)) {
      const r = runNode(conan, ["--json"], root);
      try {
        const j = JSON.parse(r.stdout || "{}");
        const missing = j.apps?.[0]?.conanDeps?.missing || [];
        const ok = missing.length === 0 && j.code !== "none";
        push(
          "check_conan",
          ok,
          ok
            ? `code=${j.code} deps ok`
            : `code=${j.code} missing=${missing.length}`,
        );
      } catch {
        push("check_conan", false, "parse failed");
      }
    }
    if (surfaces.includes("server") && fs.existsSync(server)) {
      const r = runNode(server, ["--json"], root);
      try {
        const j = JSON.parse(r.stdout || "{}");
        // server code none is fail only if state claims completed
        push(
          "check_starunion_server",
          true,
          `code=${j.code} transport=${j.transport}`,
        );
        if (j.code === "none") {
          warnings.push("server tracking code=none (deep note)");
        }
      } catch {
        warnings.push("check-starunion-server parse failed");
      }
    }
    agentChecklist.push("seainfra-tracking-check (real report + starry stats)");
  }

  if (module === "llm") {
    const probe = path.join(
      root,
      ".agents/skills/seainfra-llm-integrate/scripts/probe-llm-protocols.mjs",
    );
    const llm = config.environments?.[env]?.llm || {};
    const hasCreds = present(llm.base_url) && present(llm.api_key) && present(llm.model);
    if (live && hasCreds && fs.existsSync(probe)) {
      const r = runNode(
        probe,
        ["--env", env, "--root", root, "--json"].filter(Boolean),
        root,
      );
      // probe may not support --root; fallback without
      let out = r.stdout || "";
      let status = r.status;
      if (r.status !== 0 && /unknown|Unrecognized/i.test(r.stderr || r.stdout || "")) {
        const r2 = runNode(probe, ["--json"], root);
        out = r2.stdout || "";
        status = r2.status;
      }
      try {
        const j = JSON.parse(out.trim().split("\n").filter(Boolean).pop() || "{}");
        const protocol = llm.protocol;
        const supported =
          j.results?.[protocol]?.status === "supported" ||
          j[protocol]?.status === "supported" ||
          JSON.stringify(j).includes(`"supported"`);
        push(
          "probe_llm_live",
          status === 0 || supported,
          `exit=${status} protocol=${protocol || "n/a"}`,
        );
      } catch {
        push("probe_llm_live", status === 0, `exit=${status} (unparsed)`);
      }
    } else if (!live) {
      warnings.push("llm live probe skipped (pass --live to enable)");
      results.push({
        name: "probe_llm_live",
        ok: true,
        detail: "skipped (no --live)",
        skipped: true,
      });
    } else {
      warnings.push("llm credentials incomplete; live probe skipped");
    }
    // static protocol_probe file
    if (present(llm.protocol_probe)) {
      const p = path.resolve(root, llm.protocol_probe);
      push("protocol_probe_file", fs.existsSync(p), llm.protocol_probe);
    }
    agentChecklist.push("seainfra-llm-check (business chat path + failure path)");
  }

  if (module === "multimodal" || module === "content_safety") {
    const impl = firstExisting(root, [
      "lib/seainfra",
      "project/src/lib/seainfra",
      "project/lib/seainfra",
      "src/lib/seainfra",
    ]);
    push(
      "seainfra_impl_dir",
      Boolean(impl),
      impl ? `${impl.rel} present` : "missing lib/seainfra (checked monorepo candidates)",
    );
    agentChecklist.push(
      module === "multimodal"
        ? "seainfra-multimodal-check (create/get task)"
        : "seainfra-content-safety-check (real scan)",
    );
    if (!live) {
      warnings.push(`${module} live gateway probe skipped (pass --live)`);
    }
  }

  if (module === "payment") {
    const starry = firstExisting(root, [
      "lib/payment/starry.ts",
      "project/src/lib/payment/starry.ts",
      "src/lib/payment/starry.ts",
    ]);
    const orders = firstExisting(root, [
      "app/api/payments/orders/route.ts",
      "project/src/app/api/payments/orders/route.ts",
      "src/app/api/payments/orders/route.ts",
    ]);
    const callback = firstExisting(root, [
      "app/api/payments/callback/route.ts",
      "project/src/app/api/payments/callback/route.ts",
      "src/app/api/payments/callback/route.ts",
    ]);
    push(
      "payment_code",
      Boolean(starry && orders && callback),
      starry && orders && callback
        ? `${starry.rel} + routes`
        : "missing payment starry/orders/callback (checked monorepo candidates)",
    );
    const testFile = firstExisting(root, [
      "lib/payment/starry.test.ts",
      "project/src/lib/payment/starry.test.ts",
      "src/lib/payment/starry.test.ts",
    ]);
    if (testFile) {
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx", "--test", testFile.abs],
        { encoding: "utf8", cwd: root },
      );
      push("payment_signature_tests", r.status === 0, `exit ${r.status}`);
    }
    if (live) {
      warnings.push(
        "payment live create_order not auto-run in deep (use payment-check; avoid accidental charges)",
      );
    }
    agentChecklist.push(
      "seainfra-payment-check (channel_check + sandbox pay + callback idempotency)",
    );
  }

  if (module === "search_recommend") {
    const intake =
      config.environments?.[env]?.search_recommend?.business_detail_id ||
      config.environments?.[env]?.search_recommend?.intake;
    push(
      "intake_present",
      present(intake) ||
        present(config.environments?.[env]?.search_recommend?.intake_submitted_at),
      "intake/BIZ id",
    );
    agentChecklist.push(
      "seainfra-search-recommend-check (real recommend HTTP + tracking pass-through)",
    );
  }

  if (module === "ads_acquisition") {
    agentChecklist.push(
      "seainfra-ads-acquisition-check (install attribution + conversion)",
    );
  }

  return {
    results,
    failures,
    warnings,
    agentChecklist: agentChecklist.length
      ? agentChecklist
      : [`$${CHECK_SKILL[module]} full re-run`],
    checkSkill: CHECK_SKILL[module],
  };
}

function auditEnvironment(root, env, options = {}) {
  const { deep = false, live = false } = options;
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
  const falseCompleted = [];
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

    const v1 = runValidate(root, module, env, "integration");
    if (!v1.ok) {
      if (st.status === "completed") {
        modFailures.push(`validate integration: ${v1.missing.join(", ")}`);
      } else {
        modWarnings.push(
          `validate integration incomplete: ${v1.missing.join(", ") || "exit " + v1.status}`,
        );
      }
    }
    if (
      module === "payment" &&
      (st.status === "completed" || st.status === "checking")
    ) {
      const v2 = runValidate(root, module, env, "check");
      if (!v2.ok) {
        modFailures.push(`validate payment check: ${v2.missing.join(", ")}`);
      }
    }

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
      const cross = crossChecks(root, module, env, st, config);
      modFailures.push(...cross.failures);
      modWarnings.push(...cross.warnings);
    } else if (st.userAcceptedTestClosure || st.userDeferredTo) {
      deferred += 1;
      hasTestClosureFlag = true;
      evidenceAudit = "n/a";
      modWarnings.push(
        st.userDeferredTo
          ? `deferred to ${st.userDeferredTo}`
          : "userAcceptedTestClosure (not formal completed)",
      );
    } else if (
      ["blocked", "integrating", "checking", "selected"].includes(st.status)
    ) {
      evidenceAudit = "n/a";
      if ((st.blockers || []).length) {
        modWarnings.push(
          `blockers: ${(st.blockers || []).slice(0, 2).join(" | ")}`,
        );
      } else {
        modWarnings.push(`status=${st.status} not completed`);
      }
    }

    let deepResult = null;
    if (options.deep) {
      // Mechanical deep for selected modules. Failures only hard-fail when status=completed.
      deepResult = deepProbeModule(root, module, env, config, { live });
      if (st.status === "completed") {
        modFailures.push(...deepResult.failures);
        modWarnings.push(...deepResult.warnings);
      } else {
        modWarnings.push(
          ...deepResult.failures.map((f) => `(deep-precheck) ${f}`),
          ...deepResult.warnings,
        );
      }
    }

    if (st.status === "completed" && modFailures.length === 0) {
      completedOk += 1;
    }
    if (st.status === "completed" && modFailures.length > 0) {
      falseCompleted.push({
        module,
        environment: env,
        reasons: [...modFailures],
      });
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
      deep: deepResult,
      checkSkill: CHECK_SKILL[module],
    });
  }

  const selectedModules = modulesOut.filter((m) => m.selected);
  const allCompletedClean = selectedModules.every(
    (m) =>
      m.state === "completed" &&
      m.evidenceAudit === "pass" &&
      m.failures.length === 0,
  );

  let verdict = "not_ready";
  if (allCompletedClean && selectedCount > 0) {
    verdict = "env_ready";
  } else if (
    hasTestClosureFlag ||
    selectedModules.some((m) => m.userAcceptedTestClosure || m.userDeferredTo)
  ) {
    verdict =
      falseCompleted.length > 0 ? "not_ready" : "test_closure";
  }
  if (falseCompleted.length > 0) {
    verdict = "not_ready";
  }

  let nextAction = "无";
  if (verdict === "env_ready") {
    nextAction =
      "该环境全部 selected 模块证据审计通过；可宣称 env_ready。上线请再跑 --mode ship。";
  } else if (verdict === "test_closure") {
    nextAction =
      "测试收口可暂停；不得宣称 formal 完成。正式项目按 failures/warnings 重跑对应 *-check。";
  } else if (falseCompleted.length) {
    nextAction = `假 completed: ${falseCompleted.map((f) => f.module).join(", ")}。运行 --fix-false-completed 自动 block，或重跑对应 Check。`;
  } else {
    const first = selectedModules.find(
      (m) =>
        m.failures.length ||
        (m.state !== "completed" &&
          !m.userDeferredTo &&
          !m.userAcceptedTestClosure),
    );
    if (first?.failures?.length) {
      nextAction = `修复 ${first.module}: ${first.failures[0]}；然后跑 ${first.checkSkill}`;
    } else if (first) {
      nextAction = `继续 ${first.module}（status=${first.state}）→ check-start + ${first.checkSkill}`;
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
    falseCompleted,
    modules: modulesOut,
    failures,
    warnings,
    nextAction,
    testProjectClosure: state.testProjectClosure || null,
  };
}

function applyFalseCompletedBlocks(root, report) {
  const applied = [];
  const envs =
    report.mode === "ship"
      ? [
          ["test", report.test],
          ["production", report.production],
        ]
      : [[report.environment, report]];

  for (const [env, r] of envs) {
    if (!r?.falseCompleted?.length) continue;
    for (const item of r.falseCompleted) {
      const reason = `evidence_audit_failed: ${item.reasons.slice(0, 3).join("; ")}`;
      const result = runBlock(root, item.module, env, reason);
      applied.push({
        module: item.module,
        environment: env,
        reason,
        ok: result.ok,
        manage: result.stdout || result.stderr,
      });
    }
  }
  return applied;
}

function printHuman(report) {
  console.log(`SeaInfra completion audit`);
  console.log(`mode: ${report.mode}  verdict: ${report.verdict}`);
  if (report.environment) {
    console.log(
      `env: ${report.environment}  selected: ${report.selectedCount}  completed_ok: ${report.completedOk}  deferred: ${report.deferred}  false_completed: ${report.falseCompleted?.length || 0}`,
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
      if (m.deep?.agentChecklist?.length) {
        console.log(`      deep → agent: ${m.deep.agentChecklist[0]}`);
      }
    }
  }
  if (report.test) {
    console.log(`\ntest: ${report.test.verdict} (false_completed=${report.test.falseCompleted?.length || 0})`);
    console.log(
      `production: ${report.production.verdict} (false_completed=${report.production.falseCompleted?.length || 0})`,
    );
  }
  if (report.fixed?.length) {
    console.log("\nAuto-blocked false completed:");
    for (const f of report.fixed) {
      console.log(
        `  ${f.ok ? "✓" : "×"} ${f.module}/${f.environment}: ${f.reason.slice(0, 120)}`,
      );
    }
  }
  if (report.failures?.length) {
    console.log("\nFailures:");
    for (const f of report.failures.slice(0, 40)) console.log(`  × ${f}`);
  }
  if (report.warnings?.length) {
    console.log("\nWarnings:");
    for (const w of report.warnings.slice(0, 25)) console.log(`  ! ${w}`);
  }
  console.log(`\nNext: ${report.nextAction}`);
}

function main() {
  const root = resolveRoot();
  const mode = arg("--mode", "audit"); // audit | env | ship | deep
  const env = arg("--env", "test");
  const asJson = hasFlag("--json");
  const live = hasFlag("--live");
  const fixFalse = hasFlag("--fix-false-completed");
  const writeReport = arg("--write-report");

  if (!["audit", "env", "ship", "deep"].includes(mode)) {
    fail("mode must be audit|env|ship|deep");
  }
  if (mode !== "ship" && !["test", "production"].includes(env)) {
    fail("env must be test|production");
  }

  let report;
  if (mode === "ship") {
    const testR = auditEnvironment(root, "test", { deep: false, live });
    const prodR = auditEnvironment(root, "production", { deep: false, live });
    const shipReady =
      testR.verdict === "env_ready" && prodR.verdict === "env_ready";
    report = {
      mode: "ship",
      verdict: shipReady ? "ship_ready" : "not_ready",
      test: testR,
      production: prodR,
      falseCompleted: [
        ...(testR.falseCompleted || []).map((f) => ({ ...f, environment: "test" })),
        ...(prodR.falseCompleted || []).map((f) => ({
          ...f,
          environment: "production",
        })),
      ],
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
    const deep = mode === "deep";
    const r = auditEnvironment(root, env, { deep, live });
    report = {
      mode,
      live,
      ...r,
    };
  }

  if (fixFalse) {
    report.fixed = applyFalseCompletedBlocks(root, report);
    // re-audit after fix for primary env
    if (mode === "ship") {
      report.test = auditEnvironment(root, "test", { deep: false, live });
      report.production = auditEnvironment(root, "production", {
        deep: false,
        live,
      });
      report.verdict =
        report.test.verdict === "env_ready" &&
        report.production.verdict === "env_ready"
          ? "ship_ready"
          : report.test.verdict === "test_closure" &&
              report.production.verdict !== "not_ready"
            ? "test_closure"
            : "not_ready";
      // simplify after fix
      if (
        (report.test.falseCompleted?.length || 0) === 0 &&
        (report.production.falseCompleted?.length || 0) === 0 &&
        report.verdict === "not_ready" &&
        (report.test.verdict === "test_closure" ||
          report.production.verdict === "test_closure")
      ) {
        // keep not_ready if either not ready; prefer test_closure only if both allow
      }
    } else {
      const again = auditEnvironment(root, env, {
        deep: mode === "deep",
        live,
      });
      report = {
        ...report,
        ...again,
        mode: report.mode,
        live: report.live,
        fixed: report.fixed,
      };
    }
  }

  if (writeReport) {
    const outPath = path.resolve(root, writeReport);
    writeJson(outPath, {
      schemaVersion: 1,
      kind: "completion_audit",
      checkedAt: new Date().toISOString(),
      ...report,
    });
    report.reportPath = path.relative(root, outPath);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
    if (report.reportPath) console.log(`\nReport: ${report.reportPath}`);
  }

  const hasFalse =
    (report.falseCompleted?.length || 0) > 0 ||
    (report.test?.falseCompleted?.length || 0) > 0 ||
    (report.production?.falseCompleted?.length || 0) > 0;

  if (mode === "audit" || mode === "deep") {
    // integrity: fail on false completed; deep also fails if completed modules still have deep failures
    process.exit(hasFalse || (mode === "deep" && report.failures?.length) ? 1 : 0);
  }
  if (mode === "env") {
    process.exit(report.verdict === "env_ready" ? 0 : 1);
  }
  if (mode === "ship") {
    process.exit(report.verdict === "ship_ready" ? 0 : 1);
  }
}

main();
