import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-llm-protocols.mjs');
const execFileAsync = promisify(execFile);

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function fixture(baseUrl, apiKey = 'secret-probe-key') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-probe-'));
  const dir = path.join(root, '.agents', 'seainfra');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
    environments: {
      test: { llm: { base_url: baseUrl, api_key: apiKey, model: 'test-model', timeout_ms: 1000 } },
    },
  }));
  return root;
}

test('detects supported protocols without exposing the API key', async (t) => {
  const auth = [];
  const server = await listen((request, response) => {
    auth.push({ path: request.url, authorization: request.headers.authorization, apiKey: request.headers['x-api-key'] });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/llm/v1/chat/completions') {
      response.end(JSON.stringify({ id: 'chat-1', choices: [{ message: { role: 'assistant', content: 'OK' } }] }));
      return;
    }
    if (request.url === '/llm/v1/responses') {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: { type: 'rate_limit_error', message: 'try later' } }));
      return;
    }
    if (request.url === '/llm/v1/messages' && !request.headers['x-api-key']) {
      response.statusCode = 401;
      response.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error' } }));
      return;
    }
    response.end(JSON.stringify({ id: 'msg-1', type: 'message', content: [{ type: 'text', text: 'OK' }] }));
  });
  t.after(() => server.close());
  const { port } = server.address();
  const root = fixture(`http://127.0.0.1:${port}/llm/v1`);

  const result = await execFileAsync(process.execPath, [script, '--root', root, '--env', 'test'], { encoding: 'utf8' });
  assert.equal(result.stdout.includes('secret-probe-key'), false);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.supported_protocols, ['openai_chat_completions', 'anthropic_messages']);
  assert.equal(report.protocols.find((item) => item.id === 'openai_responses').status, 'endpoint_detected');
  assert.equal(report.protocols.find((item) => item.id === 'anthropic_messages').auth_mode, 'x-api-key');
  assert.equal(auth.some((item) => item.path.endsWith('/messages') && item.apiKey === 'secret-probe-key'), true);
  assert.equal(fs.readFileSync(path.join(root, report.report_path), 'utf8').includes('secret-probe-key'), false);
});

test('does not treat missing endpoints as supported', async (t) => {
  const server = await listen((_request, response) => {
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  t.after(() => server.close());
  const { port } = server.address();
  const root = fixture(`http://127.0.0.1:${port}/v1`);

  const result = await execFileAsync(process.execPath, [script, '--root', root, '--env', 'test'], { encoding: 'utf8' });
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.supported_protocols, []);
  assert.equal(report.protocols.every((item) => item.status === 'unsupported'), true);
});
