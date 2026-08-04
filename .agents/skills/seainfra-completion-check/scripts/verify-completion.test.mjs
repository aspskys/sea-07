import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, "verify-completion.mjs");

function run(args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd,
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function scaffoldRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "seainfra-completion-"));
  // minimal manage script shim for validate/block
  const manageDir = path.join(
    root,
    ".agents/skills/seainfra-onboarding/scripts",
  );
  fs.mkdirSync(manageDir, { recursive: true });
  // copy real manage is heavy; use a tiny shim that always validates ok
  fs.writeFileSync(
    path.join(manageDir, "manage-seainfra.mjs"),
    `import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const cmd = argv[0];
const mod = argv[1];
const envIdx = argv.indexOf('--env');
const env = envIdx >= 0 ? argv[envIdx + 1] : 'test';
const rootIdx = argv.indexOf('--root');
const root = rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd();
const statePath = path.join(root, '.agents/seainfra/state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
if (cmd === 'validate') {
  console.log(JSON.stringify({ [mod]: [] }));
  process.exit(0);
}
if (cmd === 'block') {
  const reasonIdx = argv.indexOf('--reason');
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : 'blocked';
  state.modules[mod].environments[env].status = 'blocked';
  state.modules[mod].environments[env].blockers = [reason];
  state.modules[mod].environments[env].updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n');
  console.log(mod + '/' + env + ': blocked');
  process.exit(0);
}
console.error('unknown');
process.exit(2);
`,
  );

  writeJson(path.join(root, ".agents/seainfra/config.json"), {
    schemaVersion: 1,
    activeEnvironment: "test",
    project: { root: ".", targets: [] },
    sources: { llm: [{ type: "skill", location: "x", scope: "x" }] },
    environments: {
      test: {
        llm: {
          base_url: "https://example.com",
          api_key: "k",
          model: "m",
          timeout_ms: 1000,
          protocol: "openai_responses",
          protocol_probe: "probe.json",
        },
        multimodal: {
          base_url: null,
          api_key: null,
          capabilities: [],
          models: {},
        },
        content_safety: {
          base_url: null,
          api_key: null,
          content_types: [],
          policy: null,
        },
        data_sync: {
          database_type: null,
          database: null,
          objects: [],
          network_access: null,
          warehouse_engine: "redshift",
          target_prefix: "sync_",
        },
        tracking: { surfaces: [], client_config: null, server_config: null },
        payment: {
          gateway_base_url: null,
          client_id: null,
          channels: [],
          business_types: [],
          callback_base_url: null,
        },
        search_recommend: {
          project_id: null,
          scenes: [],
          submission_url: "https://example.com",
        },
        ads_acquisition: {
          provider: null,
          app_id: null,
          credentials: null,
          platforms: [],
          conversion_events: [],
        },
      },
      production: {
        llm: {
          base_url: null,
          api_key: null,
          model: null,
          timeout_ms: 1000,
          protocol: null,
          protocol_probe: null,
        },
        multimodal: {
          base_url: null,
          api_key: null,
          capabilities: [],
          models: {},
        },
        content_safety: {
          base_url: null,
          api_key: null,
          content_types: [],
          policy: null,
        },
        data_sync: {
          database_type: null,
          database: null,
          objects: [],
          network_access: null,
          warehouse_engine: "redshift",
          target_prefix: "sync_",
        },
        tracking: { surfaces: [], client_config: null, server_config: null },
        payment: {
          gateway_base_url: null,
          client_id: null,
          channels: [],
          business_types: [],
          callback_base_url: null,
        },
        search_recommend: {
          project_id: null,
          scenes: [],
          submission_url: "https://example.com",
        },
        ads_acquisition: {
          provider: null,
          app_id: null,
          credentials: null,
          platforms: [],
          conversion_events: [],
        },
      },
    },
  });

  return root;
}

test("detects false completed when evidence missing", () => {
  const root = scaffoldRoot();
  writeJson(path.join(root, ".agents/seainfra/state.json"), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    modules: {
      llm: {
        selected: true,
        environments: {
          test: {
            status: "completed",
            evidence: null,
            blockers: [],
          },
          production: { status: "selected", evidence: null, blockers: [] },
        },
      },
      multimodal: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      content_safety: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      data_sync: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      tracking: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      payment: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      search_recommend: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      ads_acquisition: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
    },
  });

  const r = run(["--root", root, "--env", "test", "--json"], root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.verdict, "not_ready");
  assert.equal(report.falseCompleted.length, 1);
  assert.equal(report.falseCompleted[0].module, "llm");
});

test("fix-false-completed blocks bad completed modules", () => {
  const root = scaffoldRoot();
  writeJson(path.join(root, ".agents/seainfra/state.json"), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    modules: {
      llm: {
        selected: true,
        environments: {
          test: {
            status: "completed",
            evidence: "missing.json",
            blockers: [],
          },
          production: { status: "selected", evidence: null, blockers: [] },
        },
      },
      multimodal: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      content_safety: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      data_sync: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      tracking: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      payment: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      search_recommend: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      ads_acquisition: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
    },
  });

  const r = run(
    ["--root", root, "--env", "test", "--json", "--fix-false-completed"],
    root,
  );
  // after fix, no false completed but still not env_ready → audit exit 0 if no false completed
  const report = JSON.parse(r.stdout);
  assert.ok(report.fixed?.length === 1, JSON.stringify(report.fixed));
  assert.equal(report.fixed[0].ok, true);
  const state = JSON.parse(
    fs.readFileSync(path.join(root, ".agents/seainfra/state.json"), "utf8"),
  );
  assert.equal(state.modules.llm.environments.test.status, "blocked");
  assert.match(
    state.modules.llm.environments.test.blockers[0],
    /evidence_audit_failed/,
  );
});

test("valid completed evidence yields env_ready in env mode", () => {
  const root = scaffoldRoot();
  const evidenceRel = ".agents/seainfra/evidence/llm-test.json";
  writeJson(path.join(root, evidenceRel), {
    schemaVersion: 1,
    module: "llm",
    environment: "test",
    result: "passed",
    checkedAt: new Date().toISOString(),
    sourceRefs: ["docs"],
    checks: {
      static: {
        status: "passed",
        evidence: ["pnpm typecheck exit 0 and protocol set"],
      },
      connectivity: {
        status: "passed",
        evidence: ["chat HTTP 200 model=m reply=OK via gateway"],
      },
      e2e: {
        status: "passed",
        evidence: ["business adapter returns non-empty text on /api"],
      },
    },
    notes: [],
  });
  writeJson(path.join(root, ".agents/seainfra/state.json"), {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    modules: {
      llm: {
        selected: true,
        environments: {
          test: {
            status: "completed",
            evidence: evidenceRel,
            blockers: [],
          },
          production: { status: "selected", evidence: null, blockers: [] },
        },
      },
      multimodal: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      content_safety: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      data_sync: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      tracking: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      payment: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      search_recommend: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
      ads_acquisition: {
        selected: false,
        environments: {
          test: { status: "not_selected", evidence: null, blockers: [] },
          production: { status: "not_selected", evidence: null, blockers: [] },
        },
      },
    },
  });

  const r = run(
    ["--root", root, "--env", "test", "--mode", "env", "--json"],
    root,
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.verdict, "env_ready");
  assert.equal(report.falseCompleted.length, 0);
});
