#!/usr/bin/env node
/**
 * check-conan.mjs — Conan（星云埋点）集成状态只读审计脚本
 *
 * 用法：node check-conan.mjs [--json] [--cwd <dir>]
 *   --json  输出机器可读 JSON；缺省输出人读摘要
 *   --cwd   指定扫描根目录（缺省为当前工作目录）
 *
 * 约束：零依赖（仅 node:fs / node:path）；绝不写任何文件；
 *      文本启发式检查只提供证据与 confidence 标记，不下最终结论。
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- 常量

/** 业务项目应显式声明的 7 个直接依赖（版本基线仅作展示，检测不比对版本） */
const CONAN_DIRECT_DEPS = [
  '@seaart/conan-core',
  '@seaart/conan-plugin-ad',
  '@seaart/conan-plugin-app',
  '@seaart/conan-plugin-map',
  '@seaart/conan-plugin-page',
  '@seaart/conan-plugin-starunion',
  '@seaart/conan-plugin-user',
];

/** 传递依赖（不计入缺失判定；GitHub 渠道下经镜像包内部 alias 自动解析） */
const CONAN_TRANSITIVE_DEPS = ['@seaart/conan-reporter', '@seaart/conan-utils'];

const FRAMEWORK_DEPS = [
  ['next', 'next'],
  ['nuxt', 'nuxt'],
  ['@angular/core', 'angular'],
  ['astro', 'astro'],
  ['svelte', 'svelte'],
  ['solid-js', 'solid'],
  ['vue', 'vue'],
  ['preact', 'preact'],
  ['react', 'react'],
];

const BUNDLER_DEPS = ['vite', 'webpack', 'rollup', 'parcel'];

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor',
]);
// 点目录（.git/.next/.agents/.claude 等）一律跳过：不是应用代码，且 skill 自身文件
// 含检测关键字，会造成自检测误报

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.html']);

const MAX_WALK_DEPTH = 5;
const MAX_SOURCE_FILES = 6000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB，超过跳过
const STARUNION_CLIENT_CONFIG_ENV_RE = /^\s*(?:VITE_)?CLIENT_STARUNION_CONFIG\s*=\s*(.*)$/;

// ---------------------------------------------------------------- 工具

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const cwdIdx = args.indexOf('--cwd');
const ROOT = path.resolve(cwdIdx >= 0 && args[cwdIdx + 1] ? args[cwdIdx + 1] : process.cwd());

function readTextSafe(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJsonSafe(file) {
  const text = readTextSafe(file);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 递归收集文件。onFile 返回 false 时提前终止整个遍历。 */
function walk(dir, depth, onFile) {
  if (depth > MAX_WALK_DEPTH) return true;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      if (!walk(path.join(dir, entry.name), depth + 1, onFile)) return false;
    } else if (entry.isFile()) {
      if (onFile(path.join(dir, entry.name)) === false) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- 1. 应用包发现

function detectFramework(pkg, dir) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [dep, name] of FRAMEWORK_DEPS) {
    if (!deps[dep]) continue;
    if (name === 'next') {
      const hasAppDir = ['app', 'src/app'].some((p) => fs.existsSync(path.join(dir, p)));
      const hasPagesDir = ['pages', 'src/pages'].some((p) => fs.existsSync(path.join(dir, p)));
      if (hasAppDir) return 'next-app';
      if (hasPagesDir) return 'next-pages';
      return 'next-app'; // 无法区分时按主流默认
    }
    if (name === 'react') return deps.vite ? 'react-spa' : 'react';
    return name;
  }
  // 兜底：有构建器 + 页面/构建入口，视为未知框架的前端应用
  const hasBundler = BUNDLER_DEPS.some((b) => deps[b]);
  const hasEntry = fs.existsSync(path.join(dir, 'index.html')) || Boolean(pkg.scripts && pkg.scripts.build);
  if (hasBundler && hasEntry) return 'unknown';
  return null; // 不是前端应用包
}

function detectPackageManager(appDir) {
  const locks = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  // 从应用目录一路向上（可越过 ROOT：monorepo 子目录扫描时 lockfile 在仓库根）
  let dir = appDir;
  while (true) {
    for (const [file, pm] of locks) {
      if (fs.existsSync(path.join(dir, file))) return pm;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return 'unknown';
    dir = parent;
  }
}

function detectWorkspace(appDir) {
  if (appDir === ROOT) return false;
  let dir = path.dirname(appDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return true;
    const pkg = readJsonSafe(path.join(dir, 'package.json'));
    if (pkg && pkg.workspaces) return true;
    if (dir === ROOT || path.dirname(dir) === dir) return false;
    dir = path.dirname(dir);
  }
}

function discoverApps() {
  const apps = [];
  walk(ROOT, 0, (file) => {
    if (path.basename(file) !== 'package.json') return;
    const pkg = readJsonSafe(file);
    if (!pkg) return;
    const dir = path.dirname(file);
    const framework = detectFramework(pkg, dir);
    if (framework === null) return;
    apps.push({
      dir: path.relative(ROOT, dir) || '.',
      name: pkg.name || null,
      framework,
      packageManager: detectPackageManager(dir),
      workspace: detectWorkspace(dir),
      pkg,
    });
  });
  return apps;
}

// ---------------------------------------------------------------- 2. 依赖检查

function checkDeps(app) {
  const deps = app.pkg.dependencies || {};
  const present = [];
  const missing = [];
  let aliasForm = false;
  for (const name of CONAN_DIRECT_DEPS) {
    const value = deps[name];
    if (typeof value === 'string' && value.length > 0) {
      present.push(name);
      if (value.startsWith('npm:@seaverseai/')) aliasForm = true;
    } else {
      missing.push(name);
    }
  }
  // 传递包信息性校验：显式声明（旧写法 9 条）属正常，仅记录，不参与判定
  const explicitTransitive = CONAN_TRANSITIVE_DEPS.filter((n) => deps[n]);
  return { present, missing, aliasForm, explicitTransitive };
}

// ---------------------------------------------------------------- 3. 包源渠道推断（git remote，公司规则）

function detectGitRemote() {
  let dir = ROOT;
  while (true) {
    const gitPath = path.join(dir, '.git');
    let configPath = null;
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        configPath = path.join(gitPath, 'config');
      } else if (stat.isFile()) {
        // worktree：.git 是指向 gitdir 的文件
        const gitdirMatch = (readTextSafe(gitPath) || '').match(/gitdir:\s*(.+)/);
        if (gitdirMatch) {
          const gitdir = path.resolve(dir, gitdirMatch[1].trim());
          // worktree gitdir 形如 <repo>/.git/worktrees/<name>，config 在 <repo>/.git/
          const commonMatch = (readTextSafe(path.join(gitdir, 'commondir')) || '').trim();
          const commonDir = commonMatch ? path.resolve(gitdir, commonMatch) : gitdir;
          configPath = path.join(commonDir, 'config');
        }
      }
    } catch {
      /* 该层无 .git，继续向上 */
    }
    if (configPath) {
      const config = readTextSafe(configPath);
      if (config) {
        const m = config.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/);
        if (m) return m[1].trim();
      }
      return null; // 有 git 仓库但无 origin remote
    }
    if (path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

function inferPackageSource(remoteUrl) {
  if (!remoteUrl) return 'unknown';
  const m = remoteUrl.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^:/]+)/i);
  const host = m ? m[1].toLowerCase() : '';
  return host === 'github.com' ? 'github-packages' : 'internal-npm';
}

// ---------------------------------------------------------------- 4. 代码接入 / 配置探测

function scanSources() {
  const result = {
    trackerDefFiles: [], // 含 `new StarunionTracker` 的文件
    initCallFiles: [], // 调用 init 的文件
    sdkSrcFiles: [], // 引用 CLIENT_STARUNION_SDK_SRC 或 track-sdk.global.js 的文件
    envFiles: [], // .env* 文件
    localEnvConfigFiles: [], // 含星云配置的 .env.local 文件，应迁移至对应环境
    npmrcHasMirror: false,
    truncated: false,
    // 插件栈证据在全部源码上取证（插件可能在独立模块构造），供 code 判定使用
    pluginPageSeen: false,
    pluginUserSeen: false,
    starunionMountSeen: false, // createConanParams.starunionPlugin 被引用（挂载进插件数组）
  };
  let count = 0;
  const initCallRe = /\b(initStarunionTracker|initTracker)\s*\(|\b(starunionTracker|tracker)\s*\.\s*init\s*\(/;

  walk(ROOT, 0, (file) => {
    const base = path.basename(file);
    if (base.startsWith('.env')) {
      result.envFiles.push(file);
      const text = readTextSafe(file) || '';
      const hasStarunionConfig = text.split('\n').some((line) => STARUNION_CLIENT_CONFIG_ENV_RE.test(line));
      if (hasStarunionConfig && (base === '.env.local' || base.endsWith('.local'))) {
        result.localEnvConfigFiles.push(path.relative(ROOT, file));
      }
      return;
    }
    if (base === '.npmrc') {
      const text = readTextSafe(file) || '';
      if (text.includes('@seaverseai:registry')) result.npmrcHasMirror = true;
      return;
    }
    if (!SOURCE_EXTS.has(path.extname(file))) return;
    if (++count > MAX_SOURCE_FILES) {
      result.truncated = true;
      return false;
    }
    const text = readTextSafe(file);
    if (text == null) return;
    const rel = path.relative(ROOT, file);
    if (text.includes('new StarunionTracker')) result.trackerDefFiles.push(rel);
    if (initCallRe.test(text)) result.initCallFiles.push(rel);
    if (text.includes('CLIENT_STARUNION_SDK_SRC') || text.includes('STARUNION_SDK_SRC') || text.includes('track-sdk.global.js')) {
      result.sdkSrcFiles.push(rel);
    }
    if (text.includes('ConanPluginPage')) result.pluginPageSeen = true;
    if (text.includes('ConanPluginUser')) result.pluginUserSeen = true;
    if (text.includes('createConanParams.starunionPlugin')) result.starunionMountSeen = true;
  });
  return result;
}

/** 插件顺序启发式：文本位置比较，低置信度，仅产出 warning 供人工复核 */
function checkPluginOrder(trackerDefFile) {
  const warnings = [];
  const text = readTextSafe(path.join(ROOT, trackerDefFile)) || '';
  // 文件中可能存在多处 starunionPlugin 引用（如 setCountryCode 调用），
  // 挂载进插件数组的应是最后一处，故取 lastIndexOf 与最后一个插件构造位置比较
  const starunionRef = text.lastIndexOf('createConanParams.starunionPlugin');
  if (starunionRef !== -1) {
    let lastCtor = -1;
    const ctorRe = /new\s+ConanPlugin\w+\s*[(<]/g;
    let m;
    while ((m = ctorRe.exec(text)) !== null) lastCtor = m.index;
    if (lastCtor > starunionRef) {
      warnings.push(
        `${trackerDefFile}: starunionPlugin 之后仍有插件构造，疑似未放在插件数组末尾，请人工复核 (confidence: low)`,
      );
    }
  }
  return warnings;
}

function checkEnvConfig(envFiles) {
  let sawKey = false;
  let sawValue = false;
  for (const file of envFiles) {
    const text = readTextSafe(file);
    if (!text) continue;
    for (const line of text.split('\n')) {
      const m = line.match(STARUNION_CLIENT_CONFIG_ENV_RE);
      if (!m) continue;
      sawKey = true;
      const value = m[1].trim().replace(/^['"]|['"]$/g, '');
      if (value.length > 0) sawValue = true;
    }
  }
  if (sawValue) return 'ready';
  if (sawKey) return 'missing'; // key 存在但为空 = 明确缺配置
  return 'unknown'; // 无痕迹 ≠ 未集成，可能注入在部署平台
}

// ---------------------------------------------------------------- 汇总判定

function main() {
  const apps = discoverApps();
  const sources = scanSources();
  const gitRemote = detectGitRemote();
  const packageSource = inferPackageSource(gitRemote);

  const missing = [];
  const warnings = [];

  if (sources.truncated) {
    warnings.push(`源码扫描超过 ${MAX_SOURCE_FILES} 文件上限，结果可能不完整 (confidence: low)`);
  }

  // 依赖：任一应用包满足 7 依赖即视为依赖就绪（多应用时逐个列出）
  let depsOk = false;
  let anyConanDep = false;
  for (const app of apps) {
    const dep = checkDeps(app);
    app.conanDeps = { present: dep.present.length, missing: dep.missing, aliasForm: dep.aliasForm };
    if (dep.explicitTransitive.length > 0) {
      warnings.push(
        `${app.dir}/package.json 显式声明了传递包 ${dep.explicitTransitive.join(', ')}（旧写法，属正常，现行模板只需 7 条） (confidence: high)`,
      );
    }
    if (dep.present.length > 0) anyConanDep = true;
    if (dep.missing.length === 0) depsOk = true;
  }
  if (!depsOk) {
    const detail = apps.length
      ? apps.map((a) => `${a.dir}: 缺 ${a.conanDeps.missing.length}/7`).join('; ')
      : '未发现前端应用包';
    missing.push(`conan 依赖不完整（${detail}）`);
  }

  // 代码接入。插件栈的结构性缺失（全源码取证，高置信度）计入 code 判定：
  // 缺 Page/User 插件或未挂载 starunionPlugin 时，即使其余项齐全也"运行不完整"，不得报 full
  const trackerDef = sources.trackerDefFiles.length > 0;
  if (!trackerDef) missing.push('未找到 StarunionTracker 初始化文件（new StarunionTracker）');
  const initWired =
    trackerDef && sources.initCallFiles.some((f) => !sources.trackerDefFiles.includes(f));
  if (trackerDef && !initWired) {
    missing.push('init 函数只有定义、未在初始化文件之外被调用（tracker 未接入应用入口）');
  }
  const sdkInjected = sources.sdkSrcFiles.length > 0;
  if (!sdkInjected) missing.push('未找到星云 SDK 注入（CLIENT_STARUNION_SDK_SRC / track-sdk.global.js）');
  let pluginStackOk = true;
  if (trackerDef) {
    if (!sources.pluginPageSeen) {
      pluginStackOk = false;
      missing.push('插件栈缺 ConanPluginPage（页面进入/离开事件不会上报）');
    }
    if (!sources.pluginUserSeen) {
      pluginStackOk = false;
      missing.push('插件栈缺 ConanPluginUser（用户态无法关联）');
    }
    if (!sources.starunionMountSeen) {
      pluginStackOk = false;
      missing.push('未挂载 createConanParams.starunionPlugin（数据不会转换为星云格式上报）');
    }
    for (const defFile of sources.trackerDefFiles) {
      warnings.push(...checkPluginOrder(defFile));
    }
  }

  let code;
  if (depsOk && trackerDef && initWired && sdkInjected && pluginStackOk) code = 'full';
  else if (anyConanDep || trackerDef || sdkInjected) code = 'partial';
  else code = 'none';

  const config = checkEnvConfig(sources.envFiles);
  if (sources.localEnvConfigFiles.length > 0) {
    warnings.push(
      `星云客户端配置位于本机文件 ${sources.localEnvConfigFiles.join(', ')}；请迁移至对应环境文件或部署平台环境变量，禁止使用 .env.local (confidence: high)`,
    );
  }

  const report = {
    root: ROOT,
    apps: apps.map(({ pkg, ...rest }) => rest),
    code,
    config,
    packageSource,
    gitRemote: gitRemote || null,
    npmrcHasMirror: sources.npmrcHasMirror,
    evidence: {
      trackerDefFiles: sources.trackerDefFiles,
      initCallFiles: sources.initCallFiles,
      sdkSrcFiles: sources.sdkSrcFiles,
      envFiles: sources.envFiles.map((f) => path.relative(ROOT, f)),
      localEnvConfigFiles: sources.localEnvConfigFiles,
    },
    missing: code === 'full' ? [] : missing,
    warnings,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Conan 集成审计 — ${ROOT}\n`);
  console.log(`  代码接入 : ${code}`);
  console.log(`  运行配置 : ${config}${config === 'unknown' ? '（env 无痕迹，可能注入在部署平台，请确认）' : ''}`);
  console.log(`  包源渠道 : ${packageSource}${gitRemote ? `（remote: ${gitRemote}）` : '（无 git remote，需询问用户）'}`);
  console.log(`  应用包   : ${report.apps.length ? '' : '未发现'}`);
  for (const app of report.apps) {
    console.log(
      `    - ${app.dir} [${app.framework}, ${app.packageManager}${app.workspace ? ', workspace' : ''}] conan 依赖 ${app.conanDeps.present}/7${app.conanDeps.aliasForm ? '（GitHub alias 形式）' : ''}`,
    );
  }
  if (report.missing.length) {
    console.log('\n  缺失项：');
    for (const item of report.missing) console.log(`    ✗ ${item}`);
  }
  if (report.warnings.length) {
    console.log('\n  提示：');
    for (const item of report.warnings) console.log(`    ! ${item}`);
  }
}

main();
