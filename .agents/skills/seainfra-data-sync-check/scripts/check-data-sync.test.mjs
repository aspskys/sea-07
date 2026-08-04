import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-data-sync.mjs');

function runFixture(config, mapping) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-sync-check-'));
  const dir = path.join(root, 'bigdata_config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data-sync-config.md'), config);
  fs.writeFileSync(path.join(dir, 'table-mapping.md'), mapping);
  return JSON.parse(execFileSync(process.execPath, [script, '--json', '--root', root], { encoding: 'utf8' }));
}

test('accepts complete documents with one-to-one sync mappings', () => {
  const result = runFixture(
    '# 数据库同步配置文档\n\n| 配置项 | 值 |\n|---|---|\n| 数据库 | appdb |\n',
    '# 映射\n\n## 数据表映射\n\n| 业务数据表或集合 | 数仓数据表 |\n|---|---|\n| items | sync_items |\n| users | sync_users |\n',
  );
  assert.equal(result.staticStatus, 'ready');
  assert.equal(result.mappings.length, 2);
});

test('reports unresolved configuration and invalid mappings', () => {
  const result = runFixture(
    '# 数据库同步配置文档\n\n密码：通过安全渠道另行提供\n',
    '# 映射\n\n## 数据表映射\n\n| 业务数据表或集合 | 数仓数据表 |\n|---|---|\n| items | warehouse_items |\n',
  );
  assert.equal(result.staticStatus, 'partial');
  assert.equal(result.unresolvedConfig.length, 1);
  assert.deepEqual(result.invalidMappings, [{ source: 'items', target: 'warehouse_items' }]);
});
