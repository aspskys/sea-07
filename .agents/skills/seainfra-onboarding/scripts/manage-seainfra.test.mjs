import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'manage-seainfra.mjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seainfra-state-'));
  run(root, 'init');
  return root;
}

function run(root, ...args) {
  return execFileSync(process.execPath, [script, ...args, '--root', root], { encoding: 'utf8' });
}

function trackingProjectConfig(overrides = {}) {
  return {
    project_name: 'DemoX',
    project_key: 'project-key',
    stage: 'release',
    agent_uri: 'https://tracking.test.example',
    aes_id: 'aes-id',
    aes_key: 'aes-key',
    aes_secret: 'aes-secret',
    sign_key: 'sign-key',
    sign_pub_key: 'sign-pub-key',
    sign_uri: 'https://tracking.test.example/sign',
    ...overrides,
  };
}

test('rejects selected modules with missing source and environment configuration', () => {
  const root = fixture();
  run(root, 'select', 'llm');
  const result = spawnSync(process.execPath, [script, 'validate', 'llm', '--env', 'test', '--root', root], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /sources/);
  assert.match(result.stdout, /base_url/);
  assert.match(result.stdout, /api_key/);
});

test('allows LLM protocol probing before sources and protocol selection', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.llm = {
    base_url: 'https://gateway.test.example/v1',
    api_key: 'test-key',
    model: 'test-model',
    timeout_ms: 30000,
    protocol: null,
    protocol_probe: null,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'llm');

  const probe = spawnSync(process.execPath, [script, 'validate', 'llm', '--env', 'test', '--phase', 'probe', '--root', root], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stdout);
  assert.deepEqual(JSON.parse(probe.stdout), { llm: [] });

  const integration = spawnSync(process.execPath, [script, 'validate', 'llm', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(integration.status, 2);
  assert.match(integration.stdout, /sources/);
  assert.match(integration.stdout, /protocol/);
  assert.match(integration.stdout, /protocol_probe/);
});

test('generates a redacted SeaInfra provisioning request from selected AI modules', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.llm.base_url = 'https://gateway.test.example';
  config.environments.test.llm.api_key = 'must-not-be-printed';
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'llm', 'multimodal', 'content_safety');

  const output = run(root, 'provision', '--env', 'test');
  assert.equal(output.includes('must-not-be-printed'), false);
  const result = JSON.parse(output);
  assert.equal(result.values_redacted, true);
  assert.deepEqual(result.requests[0].modules, ['llm', 'multimodal', 'content_safety']);
  assert.deepEqual(result.requests[0].fields, ['SEA_BASE_URL', 'SEA_API_KEY']);
  assert.equal(result.requests[0].configured.llm.SEA_API_KEY, true);
  assert.equal(result.requests[0].configured.multimodal.SEA_API_KEY, false);
});

test('routes tracking and payment provisioning to their owning platforms without exposing keys', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.tracking.client_config = trackingProjectConfig({ aes_secret: 'tracking-secret' });
  config.environments.test.payment.client_id = 'payment-client';
  config.environments.test.payment.client_key = 'payment-secret';
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'tracking', 'payment');

  const output = run(root, 'provision', '--env', 'test');
  assert.equal(output.includes('tracking-secret'), false);
  assert.equal(output.includes('payment-secret'), false);
  const result = JSON.parse(output);
  const tracking = result.requests.find((request) => request.capability === 'tracking');
  const payment = result.requests.find((request) => request.capability === 'payment');
  assert.equal(tracking.contact, '星合数据平台');
  assert.deepEqual(tracking.fields, ['CLIENT_STARUNION_CONFIG', 'SERVER_STARUNION_CONFIG']);
  assert.equal(tracking.configured.CLIENT_STARUNION_CONFIG, true);
  assert.equal(tracking.configured.SERVER_STARUNION_CONFIG, false);
  assert.equal(payment.contact, '星河支付平台');
  assert.deepEqual(payment.fields.slice(0, 6), ['client_id', 'client_key', 'client_pubkey', 'jwt_pubkey', 'server_key', 'server_pubkey']);
});

test('validates StarUnion client and server config keys against the target environment', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.tracking = {
    surfaces: ['client', 'server'],
    client_config: trackingProjectConfig(),
    server_config: trackingProjectConfig({ v_sign_key: 'verify-key', v_sign_pub_key: 'verify-pub-key' }),
  };
  config.environments.production.tracking = {
    surfaces: ['client'],
    client_config: trackingProjectConfig(),
    server_config: null,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'tracking');

  const testResult = spawnSync(process.execPath, [script, 'validate', 'tracking', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(testResult.status, 0, testResult.stdout);
  const productionResult = spawnSync(process.execPath, [script, 'validate', 'tracking', '--env', 'production', '--root', root], { encoding: 'utf8' });
  assert.equal(productionResult.status, 2);
  assert.match(productionResult.stdout, /production required/);
});

test('requires a key-backed channel check before payment can enter acceptance', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.payment = {
    gateway_base_url: 'https://payment.test.example',
    client_id: 'client-id',
    client_key: 'client-key',
    client_pubkey: 'client-pubkey',
    jwt_pubkey: 'jwt-pubkey',
    server_key: 'server-key',
    server_pubkey: 'server-pubkey',
    signing_key: null,
    public_key: null,
    sdk_src: 'https://payment.test.example/sdk.js',
    callback_base_url: 'https://app.test.example',
    business_types: ['one_time'],
    channels: ['Adyen', 'PayPal'],
    channel_check: null,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'payment');

  const integration = spawnSync(process.execPath, [script, 'validate', 'payment', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(integration.status, 0, integration.stdout);
  run(root, 'begin', 'payment', '--env', 'test');
  const blockedCheck = spawnSync(process.execPath, [script, 'check-start', 'payment', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(blockedCheck.status, 1);
  assert.match(blockedCheck.stderr, /channel_check/);

  config.environments.test.payment.channel_check = {
    method: 'payment_sdk',
    checked_at: '2026-07-30T00:00:00.000Z',
    enabled_channels: ['Adyen'],
    evidence_ref: '.agents/seainfra/channel-checks/payment-test.json',
    platform_confirmation_ref: 'ticket:PAY-1',
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const incomplete = spawnSync(process.execPath, [script, 'validate', 'payment', '--env', 'test', '--phase', 'check', '--root', root], { encoding: 'utf8' });
  assert.equal(incomplete.status, 2);
  assert.match(incomplete.stdout, /PayPal/);

  config.environments.test.payment.channel_check.enabled_channels.push('PayPal');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const complete = spawnSync(process.execPath, [script, 'validate', 'payment', '--env', 'test', '--phase', 'check', '--root', root], { encoding: 'utf8' });
  assert.equal(complete.status, 0, complete.stdout);
  assert.match(run(root, 'check-start', 'payment', '--env', 'test'), /payment\/test: checking/);
});

test('rejects semantically invalid configuration values', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sources.llm = [{ type: 'reference', location: 'llm-gateway.md', scope: 'test' }];
  config.environments.test.llm = {
    base_url: 'not-a-url',
    api_key: 'test-key',
    model: 'documented-model',
    timeout_ms: 0,
    protocol: 'unknown-protocol',
    protocol_probe: 'probe.json',
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'select', 'llm');

  const result = spawnSync(process.execPath, [script, 'validate', 'llm', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /invalid http\/https URL/);
  assert.match(result.stdout, /positive integer required/);
  assert.match(result.stdout, /openai_chat_completions/);
});

test('initializes an empty project without overwriting later values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seainfra-empty-'));
  run(root, 'init');

  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const statePath = path.join(root, '.agents', 'seainfra', 'state.json');
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(statePath), true);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepEqual(config.sources.llm, []);
  assert.deepEqual(config.sources.multimodal, [{
    type: 'reference',
    location: '.agents/skills/seainfra-multimodal-integrate/references/sea-ai-gateway-contract.md',
    scope: 'official Sea SDK modal catalog, schema and asynchronous task contract',
  }]);
  assert.deepEqual(config.sources.content_safety, [{
    type: 'reference',
    location: '.agents/skills/seainfra-content-safety-integrate/references/sea-sdk-contract.md',
    scope: 'official Sea SDK text, image, video and fusion safety contract',
  }]);
  for (const environment of ['test', 'production']) {
    assert.equal(config.environments[environment].multimodal.base_url, 'https://seainfra.ai');
    assert.equal(config.environments[environment].content_safety.base_url, 'https://seainfra.ai');
    assert.equal(config.environments[environment].llm.protocol, null);
    assert.equal(config.environments[environment].llm.protocol_probe, null);
  }
  assert.deepEqual(config.sources.tracking.map((source) => source.location), [
    '.agents/skills/seainfra-tracking-integrate/references/platform-config.md',
    '.agents/skills/seainfra-tracking-client-integrate/SKILL.md',
    '.agents/skills/seainfra-tracking-server-integrate/SKILL.md',
  ]);
  assert.equal(config.sources.payment[0].location, '.agents/skills/seainfra-payment-integrate/references/platform-credentials.md');
  for (const environment of ['test', 'production']) {
    assert.equal(config.environments[environment].payment.client_key, null);
    assert.equal(config.environments[environment].payment.jwt_pubkey, null);
    assert.equal(config.environments[environment].payment.server_key, null);
    assert.equal(config.environments[environment].payment.channel_check, null);
  }
  assert.deepEqual(config.sources.search_recommend, [{
    type: 'skill',
    location: '.agents/skills/seainfra-search-recommend-integrate/SKILL.md',
    scope: 'intake, submission and project integration',
  }]);
  assert.deepEqual(config.sources.data_sync, [{
    type: 'skill',
    location: '.agents/skills/seainfra-data-sync-integrate/SKILL.md',
    scope: 'database configuration, support handoff and table mapping',
  }]);
  config.project.targets = ['web'];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  run(root, 'init');
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')).project.targets, ['web']);
});

test('selects and completes data sync before allowing search recommendation to begin', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const statePath = path.join(root, '.agents', 'seainfra', 'state.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.environments.test.data_sync = {
    database_type: 'postgresql',
    database: 'appdb',
    objects: ['items'],
    gcp_project: null,
    username: 'readonly',
    password: 'test-password',
    connection_url: 'postgresql://readonly:test-password@db.test.example/appdb',
    read_only: true,
    network_access: 'private',
    warehouse_engine: 'redshift',
    target_prefix: 'sync_',
  };
  config.environments.test.search_recommend = {
    project_id: 'demo_x',
    scenes: ['home'],
    submission_url: 'https://recommender.test.example/intakes',
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const selectedOutput = run(root, 'select', 'search_recommend');
  assert.match(selectedOutput, /data_sync, search_recommend/);
  const selectedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(selectedState.modules.data_sync.selected, true);
  assert.equal(selectedState.modules.search_recommend.selected, true);

  const blocked = spawnSync(process.execPath, [script, 'begin', 'search_recommend', '--env', 'test', '--root', root], { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /dependency incomplete: data_sync/);

  run(root, 'begin', 'data_sync', '--env', 'test');
  run(root, 'check-start', 'data_sync', '--env', 'test');
  const evidenceDir = path.join(root, '.agents', 'seainfra', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'data_sync-test.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    module: 'data_sync',
    environment: 'test',
    result: 'passed',
    sourceRefs: ['data sync integration contract'],
    checks: {
      static: { status: 'passed', evidence: ['mapping valid'] },
      connectivity: { status: 'passed', evidence: ['source and target reachable'] },
      e2e: { status: 'passed', evidence: ['item synchronized'] },
    },
  }));
  run(root, 'complete', 'data_sync', '--env', 'test', '--evidence', evidencePath);

  assert.match(run(root, 'begin', 'search_recommend', '--env', 'test'), /search_recommend\/test: integrating/);
});

test('requires valid evidence before completing the legal state flow', () => {
  const root = fixture();
  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sources.llm = [{ type: 'reference', location: 'llm-gateway.md', scope: 'test' }];
  config.environments.test.llm = {
    base_url: 'https://gateway.test.example',
    api_key: 'test-key',
    model: 'documented-model',
    timeout_ms: 30000,
    protocol: 'openai_responses',
    protocol_probe: '.agents/seainfra/probes/llm-test.json',
  };
  const probeDir = path.join(root, '.agents', 'seainfra', 'probes');
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, 'llm-test.json'), JSON.stringify({
    schemaVersion: 1,
    environment: 'test',
    base_url: 'https://gateway.test.example',
    model: 'documented-model',
    supported_protocols: ['openai_responses'],
  }));
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  run(root, 'select', 'llm');
  run(root, 'begin', 'llm', '--env', 'test');
  run(root, 'check-start', 'llm', '--env', 'test');

  const invalidEvidence = path.join(root, 'invalid-evidence.json');
  fs.writeFileSync(invalidEvidence, JSON.stringify({ module: 'llm', environment: 'test', result: 'passed' }));
  const rejected = spawnSync(process.execPath, [script, 'complete', 'llm', '--env', 'test', '--evidence', invalidEvidence, '--root', root], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /evidence static is not passed/);

  const evidenceDir = path.join(root, '.agents', 'seainfra', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'llm-test.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    module: 'llm',
    environment: 'test',
    result: 'passed',
    sourceRefs: ['llm-gateway.md'],
    checks: {
      static: { status: 'passed', evidence: ['unit test'] },
      connectivity: { status: 'passed', evidence: ['request test-1'] },
      e2e: { status: 'passed', evidence: ['business flow'] },
    },
  }));
  run(root, 'complete', 'llm', '--env', 'test', '--evidence', evidencePath);

  const state = JSON.parse(fs.readFileSync(path.join(root, '.agents', 'seainfra', 'state.json'), 'utf8'));
  assert.equal(state.modules.llm.environments.test.status, 'completed');
  assert.equal(state.modules.llm.environments.test.evidence, '.agents/seainfra/evidence/llm-test.json');
});
