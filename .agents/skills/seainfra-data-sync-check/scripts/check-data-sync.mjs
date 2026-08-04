#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = path.resolve(option('--root', process.cwd()));
const json = args.includes('--json');
const configPath = path.join(root, 'bigdata_config', 'data-sync-config.md');
const mappingPath = path.join(root, 'bigdata_config', 'table-mapping.md');

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function parseMappings(markdown) {
  if (!markdown) return [];
  const section = markdown.split(/^## 数据表映射\s*$/m)[1] ?? '';
  return section.split('\n').flatMap((line) => {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
    if (!match) return [];
    const source = match[1].trim();
    const target = match[2].trim();
    if (source === '业务数据表或集合' || /^[-:]+$/.test(source)) return [];
    return [{ source, target }];
  });
}

const config = read(configPath);
const mapping = read(mappingPath);
const mappings = parseMappings(mapping);
const invalidMappings = mappings.filter(({ source, target }) => target !== `sync_${source}`);
const duplicateSources = mappings.filter(({ source }, index) => mappings.findIndex((item) => item.source === source) !== index).map(({ source }) => source);
const duplicateTargets = mappings.filter(({ target }, index) => mappings.findIndex((item) => item.target === target) !== index).map(({ target }) => target);
const unresolvedConfig = (config ?? '').split('\n')
  .map((line, index) => ({ line: index + 1, text: line.trim() }))
  .filter(({ text }) => /通过安全渠道|另行提供|待提供|未提供|TODO|\{[^}]+\}/i.test(text));
const missing = [];
if (!config) missing.push('bigdata_config/data-sync-config.md');
if (!mapping) missing.push('bigdata_config/table-mapping.md');
if (mapping && mappings.length === 0) missing.push('table mappings');

const staticStatus = missing.length === 0 && invalidMappings.length === 0 && duplicateSources.length === 0 && duplicateTargets.length === 0 && unresolvedConfig.length === 0
  ? 'ready'
  : (config || mapping ? 'partial' : 'none');
const result = {
  root,
  staticStatus,
  documents: {
    config: config ? path.relative(root, configPath) : null,
    mapping: mapping ? path.relative(root, mappingPath) : null,
  },
  mappings,
  invalidMappings,
  duplicateSources: [...new Set(duplicateSources)],
  duplicateTargets: [...new Set(duplicateTargets)],
  unresolvedConfig,
  missing,
  note: 'ready only means the local documents pass static checks; connectivity and synchronized warehouse data still require runtime verification',
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Data sync static status: ${staticStatus}`);
  console.log(`Mappings: ${mappings.length}`);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
  if (unresolvedConfig.length) console.log(`Unresolved config lines: ${unresolvedConfig.map(({ line }) => line).join(', ')}`);
}
