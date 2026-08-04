#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const PROTOCOLS = [
  {
    id: 'openai_chat_completions',
    label: 'OpenAI Chat Completions',
    endpoint: 'chat/completions',
    specUrl: 'https://platform.openai.com/docs/api-reference/chat/create',
    body: (model) => ({ model, messages: [{ role: 'user', content: 'Reply with exactly OK.' }] }),
    matches: (body) => Array.isArray(body?.choices),
    matchesError: (body) => body?.error && typeof body.error === 'object',
    authModes: ['bearer'],
  },
  {
    id: 'openai_responses',
    label: 'OpenAI Responses',
    endpoint: 'responses',
    specUrl: 'https://platform.openai.com/docs/api-reference/responses/create',
    body: (model) => ({ model, input: 'Reply with exactly OK.' }),
    matches: (body) => body?.object === 'response' || Array.isArray(body?.output),
    matchesError: (body) => body?.error && typeof body.error === 'object',
    authModes: ['bearer'],
  },
  {
    id: 'anthropic_messages',
    label: 'Anthropic Messages',
    endpoint: 'messages',
    specUrl: 'https://docs.anthropic.com/en/api/messages',
    body: (model) => ({ model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply with exactly OK.' }] }),
    matches: (body) => body?.type === 'message' && Array.isArray(body?.content),
    matchesError: (body) => body?.type === 'error' || (body?.error && typeof body.error === 'object'),
    authModes: ['bearer', 'x-api-key'],
  },
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

function present(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function endpointUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, '')}/${endpoint}`;
}

function headers(apiKey, authMode) {
  const result = { 'content-type': 'application/json' };
  if (authMode === 'bearer') result.authorization = `Bearer ${apiKey}`;
  if (authMode === 'x-api-key') {
    result['x-api-key'] = apiKey;
    result['anthropic-version'] = '2023-06-01';
  }
  return result;
}

function safeError(body, apiKey) {
  const value = body?.error?.message ?? body?.error?.type ?? body?.message ?? body?.type;
  if (!present(value)) return null;
  return String(value).replaceAll(apiKey, '<redacted>').slice(0, 300);
}

async function request(candidate, config, authMode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout_ms);
  try {
    const response = await fetch(endpointUrl(config.base_url, candidate.endpoint), {
      method: 'POST',
      headers: headers(config.api_key, authMode),
      body: JSON.stringify(candidate.body(config.model)),
      signal: controller.signal,
    });
    const raw = (await response.text()).slice(0, 65_536);
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // Non-JSON responses cannot confirm an API protocol.
    }
    return {
      httpStatus: response.status,
      body,
      requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'),
      authMode,
    };
  } catch (error) {
    return { networkError: error.name === 'AbortError' ? 'timeout' : String(error.message).slice(0, 300), authMode };
  } finally {
    clearTimeout(timer);
  }
}

function classify(candidate, attempt, apiKey) {
  const common = {
    id: candidate.id,
    label: candidate.label,
    endpoint: candidate.endpoint,
    spec_url: candidate.specUrl,
    auth_mode: attempt.authMode,
    http_status: attempt.httpStatus ?? null,
    request_id: attempt.requestId ?? null,
  };
  if (attempt.networkError) return { ...common, status: 'inconclusive', reason: attempt.networkError };
  if (attempt.httpStatus >= 200 && attempt.httpStatus < 300 && candidate.matches(attempt.body)) {
    return { ...common, status: 'supported', reason: 'successful response matched protocol shape' };
  }
  if (attempt.httpStatus >= 200 && attempt.httpStatus < 300) {
    return { ...common, status: 'inconclusive', reason: 'successful response did not match protocol shape' };
  }
  if ([404, 405].includes(attempt.httpStatus)) {
    return { ...common, status: 'unsupported', reason: `endpoint returned HTTP ${attempt.httpStatus}` };
  }
  if ([400, 409, 422, 429].includes(attempt.httpStatus) && candidate.matchesError(attempt.body)) {
    return { ...common, status: 'endpoint_detected', reason: safeError(attempt.body, apiKey) ?? `protocol-shaped HTTP ${attempt.httpStatus} error` };
  }
  if ([401, 403].includes(attempt.httpStatus)) {
    return { ...common, status: 'inconclusive', reason: `authentication rejected with HTTP ${attempt.httpStatus}` };
  }
  return { ...common, status: 'inconclusive', reason: safeError(attempt.body, apiKey) ?? `HTTP ${attempt.httpStatus}` };
}

async function probe(candidate, config) {
  const attemptedAuthModes = [];
  let result;
  for (const authMode of candidate.authModes) {
    attemptedAuthModes.push(authMode);
    const attempt = await request(candidate, config, authMode);
    result = classify(candidate, attempt, config.api_key);
    if (![401, 403].includes(attempt.httpStatus) || authMode === candidate.authModes.at(-1)) break;
  }
  return { ...result, attempted_auth_modes: attemptedAuthModes };
}

async function main() {
  const argv = process.argv.slice(2);
  const root = path.resolve(option(argv, '--root', process.cwd()));
  const environment = option(argv, '--env', 'test');
  if (!['test', 'production'].includes(environment)) fail(`unknown environment: ${environment}`);
  if (environment === 'production' && !argv.includes('--confirm-production')) {
    fail('production probing requires --confirm-production after explicit user confirmation');
  }

  const configPath = path.join(root, '.agents', 'seainfra', 'config.json');
  if (!fs.existsSync(configPath)) fail('missing .agents/seainfra/config.json; run onboarding init first');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))?.environments?.[environment]?.llm;
  for (const key of ['base_url', 'api_key', 'model', 'timeout_ms']) {
    if (!present(config?.[key])) fail(`missing ${environment}.llm.${key}`);
  }
  try {
    const url = new URL(config.base_url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported URL protocol');
  } catch (error) {
    fail(`invalid ${environment}.llm.base_url: ${error.message}`);
  }
  if (!Number.isInteger(config.timeout_ms) || config.timeout_ms <= 0) fail('llm.timeout_ms must be a positive integer');

  const protocols = await Promise.all(PROTOCOLS.map((candidate) => probe(candidate, config)));
  const timestamp = new Date().toISOString();
  const defaultName = `llm-${environment}-${timestamp.replace(/[:.]/g, '-')}.json`;
  const outputPath = path.resolve(option(argv, '--output', path.join(root, '.agents', 'seainfra', 'probes', defaultName)));
  const report = {
    schemaVersion: 1,
    environment,
    base_url: config.base_url,
    model: config.model,
    probed_at: timestamp,
    supported_protocols: protocols.filter((item) => item.status === 'supported').map((item) => item.id),
    protocols,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, report_path: path.relative(root, outputPath) }, null, 2));
}

await main();
