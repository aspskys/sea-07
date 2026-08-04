#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const MODULES = ['llm', 'multimodal', 'content_safety', 'data_sync', 'tracking', 'payment', 'search_recommend', 'ads_acquisition'];
const ENVIRONMENTS = ['test', 'production'];
const STATUS = ['not_selected', 'selected', 'integrating', 'checking', 'completed', 'blocked'];
const DEPENDENCIES = { search_recommend: ['data_sync'] };
const PROVISION_FIELDS = {
  data_sync: ['database_type', 'database', 'objects', 'network_access'],
  search_recommend: ['project_id', 'scenes', 'submission_url'],
  ads_acquisition: ['provider', 'app_id', 'credentials', 'platforms', 'conversion_events'],
};
const TRACKING_CONFIG_KEYS = ['project_name', 'project_key', 'stage', 'agent_uri', 'aes_id', 'aes_key', 'aes_secret', 'sign_key', 'sign_pub_key'];
const PAYMENT_CHANNEL_CHECK_METHODS = ['platform_api', 'payment_sdk'];

const argv = process.argv.slice(2);
const command = argv.shift();
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
const positional = argv.filter((value, index) => !value.startsWith('--') && (index === 0 || !argv[index - 1].startsWith('--')));
const root = path.resolve(option('--root', process.cwd()));
const environment = option('--env', 'test');
const baseDir = path.join(root, '.agents', 'seainfra');
const configPath = path.join(baseDir, 'config.json');
const statePath = path.join(baseDir, 'state.json');

function defaultEnvironment() {
  return {
    llm: { base_url: null, api_key: null, model: null, timeout_ms: 30000, protocol: null, protocol_probe: null },
    multimodal: { base_url: 'https://seainfra.ai', api_key: null, capabilities: [], models: {} },
    content_safety: { base_url: 'https://seainfra.ai', api_key: null, content_types: [], policy: null },
    data_sync: { database_type: null, database: null, objects: [], gcp_project: null, username: null, password: null, connection_url: null, read_only: null, network_access: null, warehouse_engine: 'redshift', target_prefix: 'sync_' },
    tracking: { surfaces: [], client_config: null, server_config: null },
    payment: {
      gateway_base_url: null,
      client_id: null,
      client_key: null,
      client_pubkey: null,
      jwt_pubkey: null,
      server_key: null,
      server_pubkey: null,
      signing_key: null,
      public_key: null,
      sdk_src: null,
      callback_base_url: null,
      business_types: [],
      channels: [],
      channel_check: null,
    },
    search_recommend: { project_id: null, scenes: [], submission_url: 'https://moreshort-recommender-strategy-recall-data-update.gpu-api.seaart.dev/rec-prd-bot/integration-intakes' },
    ads_acquisition: { provider: null, app_id: null, credentials: null, platforms: [], conversion_events: [] },
  };
}

function defaultConfig() {
  return {
    schemaVersion: 1,
    activeEnvironment: 'test',
    project: { root: '.', targets: [] },
    sources: {
      llm: [],
      multimodal: [{ type: 'reference', location: '.agents/skills/seainfra-multimodal-integrate/references/sea-ai-gateway-contract.md', scope: 'official Sea SDK modal catalog, schema and asynchronous task contract' }],
      content_safety: [{ type: 'reference', location: '.agents/skills/seainfra-content-safety-integrate/references/sea-sdk-contract.md', scope: 'official Sea SDK text, image, video and fusion safety contract' }],
      data_sync: [{ type: 'skill', location: '.agents/skills/seainfra-data-sync-integrate/SKILL.md', scope: 'database configuration, support handoff and table mapping' }],
      tracking: [
        { type: 'reference', location: '.agents/skills/seainfra-tracking-integrate/references/platform-config.md', scope: 'StarUnion client and server project configuration provisioning' },
        { type: 'skill', location: '.agents/skills/seainfra-tracking-client-integrate/SKILL.md', scope: 'web client' },
        { type: 'skill', location: '.agents/skills/seainfra-tracking-server-integrate/SKILL.md', scope: 'server' },
      ],
      payment: [
        { type: 'reference', location: '.agents/skills/seainfra-payment-integrate/references/platform-credentials.md', scope: 'StarRiver payment credential bundle and channel entitlement gate' },
        { type: 'skill', location: 'cashier-integration', scope: 'application, channel, implementation and acceptance routing' },
      ],
      search_recommend: [{ type: 'skill', location: '.agents/skills/seainfra-search-recommend-integrate/SKILL.md', scope: 'intake, submission and project integration' }],
      ads_acquisition: [
        { type: 'skill', location: 'ads-data-query', scope: 'post-integration AppsFlyer data verification only' },
        { type: 'reference', location: '.agents/skills/seainfra-tracking-client-integrate/references/report-api.md', scope: 'web attribution parameters and conversion events only' },
      ],
    },
    environments: { test: defaultEnvironment(), production: defaultEnvironment() },
  };
}

function defaultState() {
  const environments = () => ({
    test: { status: 'not_selected', evidence: null, blockers: [] },
    production: { status: 'not_selected', evidence: null, blockers: [] },
  });
  return {
    schemaVersion: 1,
    updatedAt: null,
    modules: Object.fromEntries(MODULES.map((module) => [module, { selected: false, environments: environments() }])),
  };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(root, file)} cannot be read as JSON: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function assertEnvironment() {
  if (!ENVIRONMENTS.includes(environment)) fail(`unknown environment: ${environment}`);
}

function assertModule(module) {
  if (!MODULES.includes(module)) fail(`unknown module: ${module}`);
}

function load() {
  if (!fs.existsSync(configPath) || !fs.existsSync(statePath)) fail('run init first');
  return { config: readJson(configPath), state: readJson(statePath) };
}

function present(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

function validHttpUrl(value) {
  if (!present(value)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validConnectionUrl(value, databaseType) {
  if (!present(value)) return false;
  try {
    const protocol = new URL(value).protocol;
    const protocols = {
      mysql: ['mysql:'],
      postgresql: ['postgres:', 'postgresql:'],
      mongodb: ['mongodb:', 'mongodb+srv:'],
    };
    return (protocols[databaseType] ?? []).includes(protocol);
  } catch {
    return false;
  }
}

function invalidLlmProtocolProbe(value) {
  if (!present(value?.protocol_probe)) return [];
  const probePath = path.resolve(root, value.protocol_probe);
  const probesDir = path.join(baseDir, 'probes');
  if (probePath !== probesDir && !probePath.startsWith(`${probesDir}${path.sep}`)) return ['protocol_probe (must be under .agents/seainfra/probes)'];
  if (!fs.existsSync(probePath)) return ['protocol_probe (file not found)'];
  let report;
  try {
    report = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  } catch {
    return ['protocol_probe (invalid JSON)'];
  }
  const invalid = [];
  if (report.environment !== environment) invalid.push('protocol_probe (environment mismatch)');
  if (report.base_url !== value.base_url) invalid.push('protocol_probe (base_url mismatch)');
  if (report.model !== value.model) invalid.push('protocol_probe (model mismatch)');
  if (present(value.protocol) && !report.supported_protocols?.includes(value.protocol)) invalid.push('protocol_probe (selected protocol is not supported)');
  return invalid;
}

function invalidPaths(module, value, phase = 'integration') {
  const invalid = [];
  const addInvalidUrl = (key) => {
    if (present(value?.[key]) && !validHttpUrl(value[key])) invalid.push(`${key} (invalid http/https URL)`);
  };

  if (module === 'llm') {
    addInvalidUrl('base_url');
    if (present(value?.timeout_ms) && (!Number.isInteger(value.timeout_ms) || value.timeout_ms <= 0)) invalid.push('timeout_ms (positive integer required)');
    if (phase === 'integration') {
      if (present(value?.protocol) && !['openai_chat_completions', 'openai_responses', 'anthropic_messages'].includes(value.protocol)) {
        invalid.push('protocol (openai_chat_completions/openai_responses/anthropic_messages only)');
      }
      invalid.push(...invalidLlmProtocolProbe(value));
    }
  }
  if (module === 'multimodal') {
    addInvalidUrl('base_url');
    for (const capability of value?.capabilities ?? []) {
      if (typeof capability !== 'string' || !capability.trim()) invalid.push('capabilities (non-empty strings required)');
      if (!present(value?.models?.[capability])) invalid.push(`models.${capability}`);
    }
  }
  if (module === 'content_safety') addInvalidUrl('base_url');
  if (module === 'data_sync') {
    const databaseType = value?.database_type;
    if (present(databaseType) && !['firebase', 'mysql', 'postgresql', 'mongodb'].includes(databaseType)) invalid.push('database_type (firebase/mysql/postgresql/mongodb only)');
    if (present(value?.network_access) && !['public', 'private'].includes(value.network_access)) invalid.push('network_access (public/private only)');
    if ((value?.objects ?? []).some((object) => typeof object !== 'string' || !object.trim())) invalid.push('objects (non-empty strings required)');
    if (new Set(value?.objects ?? []).size !== (value?.objects ?? []).length) invalid.push('objects (duplicates not allowed)');
    if (present(value?.warehouse_engine) && value.warehouse_engine !== 'redshift') invalid.push('warehouse_engine (redshift required)');
    if (present(value?.target_prefix) && value.target_prefix !== 'sync_') invalid.push('target_prefix (sync_ required)');
    if (present(databaseType) && databaseType !== 'firebase') {
      if (present(value?.connection_url) && !validConnectionUrl(value.connection_url, databaseType)) invalid.push('connection_url (protocol does not match database_type)');
      if (present(value?.read_only) && value.read_only !== true) invalid.push('read_only (true required)');
    }
  }
  if (module === 'tracking') {
    const surfaces = value?.surfaces ?? [];
    if (surfaces.some((surface) => !['client', 'server'].includes(surface))) invalid.push('surfaces (client/server only)');
    if (new Set(surfaces).size !== surfaces.length) invalid.push('surfaces (duplicates not allowed)');
    const expectedStage = environment === 'test' ? 'release' : 'production';
    for (const surface of surfaces) {
      const config = value?.[`${surface}_config`];
      if (present(config) && (typeof config !== 'object' || Array.isArray(config))) {
        invalid.push(`${surface}_config (JSON object required)`);
        continue;
      }
      if (!present(config)) continue;
      for (const key of TRACKING_CONFIG_KEYS) {
        if (!present(config[key])) invalid.push(`${surface}_config.${key}`);
      }
      if (config.stage !== expectedStage) invalid.push(`${surface}_config.stage (${expectedStage} required for ${environment})`);
      if (surface === 'server') {
        for (const key of ['v_sign_key', 'v_sign_pub_key']) {
          if (!present(config[key])) invalid.push(`server_config.${key}`);
        }
      }
    }
    if (surfaces.includes('client') && surfaces.includes('server') && present(value?.client_config) && present(value?.server_config)) {
      if (value.client_config.project_name !== value.server_config.project_name) invalid.push('client_config/server_config project_name mismatch');
      if (value.client_config.project_key !== value.server_config.project_key) invalid.push('client_config/server_config project_key mismatch');
    }
  }
  if (module === 'payment') {
    addInvalidUrl('gateway_base_url');
    addInvalidUrl('callback_base_url');
    if (present(value?.sdk_src)) addInvalidUrl('sdk_src');
    const channels = value?.channels ?? [];
    if (channels.some((channel) => typeof channel !== 'string' || !channel.trim())) invalid.push('channels (non-empty strings required)');
    if (new Set(channels).size !== channels.length) invalid.push('channels (duplicates not allowed)');
    const channelCheck = value?.channel_check;
    if (present(channelCheck)) {
      if (typeof channelCheck !== 'object' || Array.isArray(channelCheck)) {
        invalid.push('channel_check (JSON object required)');
      } else {
        if (!PAYMENT_CHANNEL_CHECK_METHODS.includes(channelCheck.method)) invalid.push('channel_check.method (platform_api/payment_sdk only)');
        for (const key of ['checked_at', 'evidence_ref', 'platform_confirmation_ref']) {
          if (!present(channelCheck[key])) invalid.push(`channel_check.${key}`);
        }
        if (!Array.isArray(channelCheck.enabled_channels) || channelCheck.enabled_channels.length === 0) {
          invalid.push('channel_check.enabled_channels');
        } else {
          const unavailable = channels.filter((channel) => !channelCheck.enabled_channels.includes(channel));
          if (unavailable.length > 0) invalid.push(`channels (not enabled: ${unavailable.join(', ')})`);
        }
      }
    }
  }
  if (module === 'search_recommend') {
    addInvalidUrl('submission_url');
    if ((value?.scenes ?? []).some((scene) => typeof scene !== 'string' || !scene.trim())) invalid.push('scenes (non-empty strings required)');
  }
  if (module === 'ads_acquisition') {
    if ((value?.platforms ?? []).some((platform) => typeof platform !== 'string' || !platform.trim())) invalid.push('platforms (non-empty strings required)');
    if ((value?.conversion_events ?? []).some((event) => typeof event !== 'string' || !event.trim())) invalid.push('conversion_events (non-empty strings required)');
  }
  return invalid;
}

function requiredPaths(module, value, phase = 'integration') {
  const rules = {
    llm: phase === 'probe' ? ['base_url', 'api_key', 'model', 'timeout_ms'] : ['base_url', 'api_key', 'model', 'timeout_ms', 'protocol', 'protocol_probe'],
    multimodal: ['base_url', 'api_key', 'capabilities', 'models'],
    content_safety: ['base_url', 'api_key', 'content_types', 'policy'],
    data_sync: ['database_type', 'database', 'objects', 'network_access', 'warehouse_engine', 'target_prefix'],
    tracking: ['surfaces'],
    payment: phase === 'check'
      ? ['gateway_base_url', 'client_id', 'client_key', 'client_pubkey', 'jwt_pubkey', 'callback_base_url', 'business_types', 'channels', 'channel_check']
      : ['gateway_base_url', 'client_id', 'client_key', 'client_pubkey', 'jwt_pubkey', 'callback_base_url', 'business_types', 'channels'],
    search_recommend: ['project_id', 'scenes', 'submission_url'],
    ads_acquisition: ['provider', 'app_id', 'credentials', 'platforms', 'conversion_events'],
  };
  const missing = rules[module].filter((key) => !present(value?.[key]));
  if (module === 'data_sync' && present(value?.database_type)) {
    if (value.database_type === 'firebase') {
      if (!present(value.gcp_project)) missing.push('gcp_project');
    } else {
      for (const key of ['username', 'password', 'connection_url', 'read_only']) {
        if (!present(value[key])) missing.push(key);
      }
    }
  }
  if (module === 'tracking') {
    const surfaces = value?.surfaces ?? [];
    if (surfaces.includes('client') && !present(value?.client_config)) missing.push('client_config');
    if (surfaces.includes('server') && !present(value?.server_config)) missing.push('server_config');
  }
  if (module === 'payment') {
    if (!present(value?.server_key) && !present(value?.signing_key)) missing.push('server_key (or legacy signing_key)');
    if (!present(value?.server_pubkey) && !present(value?.public_key)) missing.push('server_pubkey (or legacy public_key)');
  }
  return missing;
}

function validate(module, config, phase = 'integration') {
  assertModule(module);
  assertEnvironment();
  if (!['integration', 'probe', 'check'].includes(phase)) fail(`unknown validation phase: ${phase}`);
  if (phase === 'probe' && module !== 'llm') fail('probe validation phase only supports llm');
  const sources = config.sources?.[module];
  const missing = [];
  if (phase !== 'probe') {
    if (!Array.isArray(sources) || sources.length === 0) missing.push('sources');
    if (Array.isArray(sources) && sources.some((source) => !present(source?.type) || !present(source?.location) || !present(source?.scope))) {
      missing.push('sources (type/location/scope required)');
    }
  }
  const value = config.environments?.[environment]?.[module];
  missing.push(...requiredPaths(module, value, phase));
  missing.push(...invalidPaths(module, value, phase));
  return missing;
}

function touch(state) {
  state.updatedAt = new Date().toISOString();
  writeJson(statePath, state);
}

if (command === 'init') {
  if (!fs.existsSync(configPath)) writeJson(configPath, defaultConfig());
  if (!fs.existsSync(statePath)) writeJson(statePath, defaultState());
  const { config, state } = load();
  if (config.schemaVersion !== 1 || state.schemaVersion !== 1) fail('unsupported schemaVersion');
  console.log(`SeaInfra state initialized at ${path.relative(root, baseDir)}`);
  process.exit(0);
}

if (command === 'status') {
  const { config, state } = load();
  console.log(JSON.stringify({ activeEnvironment: config.activeEnvironment, modules: state.modules }, null, 2));
  process.exit(0);
}

if (command === 'provision') {
  assertEnvironment();
  const { config, state } = load();
  const targets = positional.length > 0 ? positional : MODULES.filter((module) => state.modules[module].selected);
  if (targets.length === 0) fail('provision requires selected modules or explicit module arguments');
  for (const module of targets) assertModule(module);
  const environmentConfig = config.environments?.[environment] ?? {};
  const aiModules = targets.filter((module) => ['llm', 'multimodal', 'content_safety'].includes(module));
  const requests = [];
  if (aiModules.length > 0) {
    requests.push({
      capability: 'ai_gateway',
      contact: 'SeaInfra team',
      modules: aiModules,
      fields: ['SEA_BASE_URL', 'SEA_API_KEY'],
      configured: Object.fromEntries(aiModules.map((module) => [module, {
        SEA_BASE_URL: present(environmentConfig[module]?.base_url),
        SEA_API_KEY: present(environmentConfig[module]?.api_key),
      }])),
      after_provision: {
        llm: aiModules.includes('llm') ? 'run protocol gate with configured model' : null,
        multimodal: aiModules.includes('multimodal') ? 'discover modal catalog and model schema' : null,
        content_safety: aiModules.includes('content_safety') ? 'select scan method and product policy' : null,
      },
    });
  }
  if (targets.includes('tracking')) {
    const tracking = environmentConfig.tracking ?? {};
    requests.push({
      capability: 'tracking',
      contact: '星合数据平台',
      modules: ['tracking'],
      fields: ['CLIENT_STARUNION_CONFIG', 'SERVER_STARUNION_CONFIG'],
      configured: {
        CLIENT_STARUNION_CONFIG: present(tracking.client_config),
        SERVER_STARUNION_CONFIG: present(tracking.server_config),
      },
      request_context_fields: ['surfaces', 'project/app identity'],
      after_provision: 'validate config JSON keys and environment stage before integration',
    });
  }
  if (targets.includes('payment')) {
    const payment = environmentConfig.payment ?? {};
    requests.push({
      capability: 'payment',
      contact: '星河支付平台',
      modules: ['payment'],
      fields: ['client_id', 'client_key', 'client_pubkey', 'jwt_pubkey', 'server_key', 'server_pubkey', 'gateway_base_url', 'sdk_src'],
      configured: {
        client_id: present(payment.client_id),
        client_key: present(payment.client_key),
        client_pubkey: present(payment.client_pubkey),
        jwt_pubkey: present(payment.jwt_pubkey),
        server_key: present(payment.server_key) || present(payment.signing_key),
        server_pubkey: present(payment.server_pubkey) || present(payment.public_key),
        gateway_base_url: present(payment.gateway_base_url),
        sdk_src: present(payment.sdk_src),
      },
      request_context_fields: ['business_types', 'channels', 'callback_base_url'],
      after_provision: 'verify every requested channel with a key-backed platform API or Payment SDK check',
    });
  }
  const specializedModules = [...aiModules, 'tracking', 'payment'];
  for (const module of targets.filter((item) => !specializedModules.includes(item))) {
    const fields = PROVISION_FIELDS[module] ?? [];
    requests.push({
      capability: module,
      contact: 'SeaInfra team',
      modules: [module],
      fields,
      configured: Object.fromEntries(fields.map((field) => [field, present(environmentConfig[module]?.[field])])),
    });
  }
  console.log(JSON.stringify({ environment, requests, values_redacted: true }, null, 2));
  process.exit(0);
}

if (command === 'select') {
  const { state } = load();
  if (positional.length === 0) fail('select requires at least one module');
  const selected = [];
  const selectModule = (module) => {
    assertModule(module);
    for (const dependency of DEPENDENCIES[module] ?? []) selectModule(dependency);
    state.modules[module].selected = true;
    for (const env of ENVIRONMENTS) {
      if (state.modules[module].environments[env].status === 'not_selected') {
        state.modules[module].environments[env].status = 'selected';
      }
    }
    if (!selected.includes(module)) selected.push(module);
  };
  for (const module of positional) selectModule(module);
  touch(state);
  console.log(`Selected: ${selected.join(', ')}`);
  process.exit(0);
}

if (command === 'validate') {
  const { config, state } = load();
  const phase = option('--phase', 'integration');
  const targets = positional.length > 0 ? positional : MODULES.filter((module) => state.modules[module].selected);
  const result = Object.fromEntries(targets.map((module) => [module, validate(module, config, phase)]));
  console.log(JSON.stringify(result, null, 2));
  process.exit(Object.values(result).some((missing) => missing.length > 0) ? 2 : 0);
}

const module = positional[0];
if (!module) fail(`${command ?? 'command'} requires a module`);
assertModule(module);
assertEnvironment();
const { config, state } = load();
const entry = state.modules[module];
const current = entry.environments[environment];

if (command === 'begin') {
  if (!entry.selected) fail(`${module} is not selected`);
  const incompleteDependencies = (DEPENDENCIES[module] ?? []).filter((dependency) => state.modules[dependency].environments[environment].status !== 'completed');
  if (incompleteDependencies.length > 0) fail(`dependency incomplete: ${incompleteDependencies.join(', ')} must be completed in ${environment}`);
  const missing = validate(module, config);
  if (missing.length > 0) fail(`configuration incomplete: ${missing.join(', ')}`);
  current.status = 'integrating';
  current.blockers = [];
} else if (command === 'check-start') {
  if (!['integrating', 'blocked', 'checking'].includes(current.status)) fail(`cannot check from ${current.status}`);
  const incompleteDependencies = (DEPENDENCIES[module] ?? []).filter((dependency) => state.modules[dependency].environments[environment].status !== 'completed');
  if (incompleteDependencies.length > 0) fail(`dependency incomplete: ${incompleteDependencies.join(', ')} must be completed in ${environment}`);
  const missing = validate(module, config, 'check');
  if (missing.length > 0) fail(`configuration incomplete: ${missing.join(', ')}`);
  current.status = 'checking';
  current.blockers = [];
} else if (command === 'block') {
  const reason = option('--reason');
  if (!present(reason)) fail('block requires --reason');
  current.status = 'blocked';
  current.blockers = [reason];
} else if (command === 'complete') {
  if (current.status !== 'checking') fail(`cannot complete from ${current.status}`);
  const evidenceArg = option('--evidence');
  if (!present(evidenceArg)) fail('complete requires --evidence');
  const evidencePath = path.resolve(root, evidenceArg);
  if (!fs.existsSync(evidencePath)) fail(`evidence file not found: ${evidenceArg}`);
  const evidence = readJson(evidencePath);
  if (evidence.module !== module || evidence.environment !== environment || evidence.result !== 'passed') {
    fail('evidence module, environment or result does not match');
  }
  for (const layer of ['static', 'connectivity', 'e2e']) {
    const check = evidence.checks?.[layer];
    if (!check || !['passed', 'not_applicable'].includes(check.status)) fail(`evidence ${layer} is not passed`);
    if (check.status === 'not_applicable' && !present(check.reason)) fail(`evidence ${layer} requires a reason`);
  }
  if (!Array.isArray(evidence.sourceRefs) || evidence.sourceRefs.length === 0) fail('evidence requires sourceRefs');
  current.status = 'completed';
  current.evidence = path.relative(root, evidencePath);
  current.blockers = [];
} else {
  fail(`unknown command: ${command}`);
}

if (!STATUS.includes(current.status)) fail(`invalid status: ${current.status}`);
current.updatedAt = new Date().toISOString();
touch(state);
console.log(`${module}/${environment}: ${current.status}`);
