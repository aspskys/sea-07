# Conan 客户端埋点集成指南

> 适用场景：审计判定 `code: none`（完整集成）或 `code: partial`（按缺失项补齐，已有文件先读再 diff，不得覆盖）。星云 SDK 区分服务端与客户端能力；本指南只覆盖浏览器端 Conan 接入与客户端 SDK 上报，不实现服务端埋点。
> 两道闸门通过前**不写任何文件、不装任何依赖**。

## 闸门 1：包源渠道（任何安装动作之前）

`@seaart/conan-*` 有两条发布渠道。**渠道判定是公司既定规则：按仓库 git remote 地址静默判定，不询问、不做网络探测**（网络探测有根本缺陷：研发机在内网探测内网源必然成功，但项目构建在 GitHub 时外部 CI 依然装不上）。

| git remote host | 渠道 |
| --- | --- |
| `github.com` | GitHub Packages 镜像（`@seaverseai` scope） |
| 其他 host（内网 git） | 内网 npm（`@seaart` scope） |
| 无 git remote / 无 git 仓库 | **询问用户**选择，不自行猜测 |

### 内网 npm 渠道

直接安装 7 个包（普通 semver 版本，基线见下）。安装失败（404/无权限）时向用户索取私有 registry 地址或 .npmrc 配置（仅为 `@seaart` scope 配 registry，不改全局 registry），不要自行反复换源重试。

```bash
# 按 Step 0 探测的包管理器生成，workspace 项目加对应 filter/workspace 参数
pnpm add @seaart/conan-core@^1.2.7 @seaart/conan-plugin-ad@^1.0.10 \
  @seaart/conan-plugin-app@^1.1.7 @seaart/conan-plugin-map@^1.2.7 \
  @seaart/conan-plugin-page@^1.1.7 @seaart/conan-plugin-starunion@^1.0.0 \
  @seaart/conan-plugin-user@^1.1.8
```

### GitHub Packages 渠道

镜像 scope 为 `@seaverseai`（registry `https://npm.pkg.github.com`），9 个包齐全。**硬规则：业务代码、三方代码、构建产物一律使用 `@seaart/*` import；`@seaverseai` 只允许出现在 package.json 的 alias 与 .npmrc。**

1. package.json 写入 **7 条** npm alias 依赖（已隔离安装实测：镜像包内部依赖自 v1.3 起即 alias 形式，`@seaart/conan-reporter`、`@seaart/conan-utils` 两个传递包会自动从镜像解析并被 lockfile 锁定，**无需显式声明**；遇到旧项目写了 9 条也属正常）：

   ```json
   "@seaart/conan-core": "npm:@seaverseai/conan-core@1.2.7",
   "@seaart/conan-plugin-ad": "npm:@seaverseai/conan-plugin-ad@1.0.10",
   "@seaart/conan-plugin-app": "npm:@seaverseai/conan-plugin-app@1.1.7",
   "@seaart/conan-plugin-map": "npm:@seaverseai/conan-plugin-map@1.2.7",
   "@seaart/conan-plugin-page": "npm:@seaverseai/conan-plugin-page@1.1.7",
   "@seaart/conan-plugin-starunion": "npm:@seaverseai/conan-plugin-starunion@1.0.0",
   "@seaart/conan-plugin-user": "npm:@seaverseai/conan-plugin-user@1.1.8"
   ```

2. 项目根 `.npmrc`（仅为镜像 scope 配 registry）：

   ```
   @seaverseai:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   always-auth=true
   ```

3. 认证（**用户自行配置，本流程不经手 token 值**）：
   - CI（GitHub Actions）：由用户在 workflow 权限中授予 `GITHUB_TOKEN` 的 `packages:read`，并注入为 `NODE_AUTH_TOKEN`
   - 本地开发：由用户自行创建含 `read:packages` 的 PAT，export 为 `NODE_AUTH_TOKEN` 环境变量
   - 只需确认「已配置」即可继续；不索取、不记录、不写入任何真实 token，token 也绝不出现在仓库文件中

**凭据检测规则**（避免误判"未配置"而反复追问）：

- `NODE_AUTH_TOKEN` 通常配在用户的交互式 shell 启动文件（`.zshrc` / `.zprofile` / `.bashrc` 等）。这些文件**只有交互式/登录 shell 才加载**，直接在非交互 shell 里读 `$NODE_AUTH_TOKEN` 会读不到——这不代表用户没配。
- 检测必须走用户的交互式登录 shell，且**只输出有无、绝不输出值**：

  ```bash
  zsh -ic '[ -n "$NODE_AUTH_TOKEN" ] && echo configured || echo missing'   # zsh 用户
  bash -lic '[ -n "$NODE_AUTH_TOKEN" ] && echo configured || echo missing' # bash 用户
  ```

- 检测是启发式，**不是硬门禁**：预检为 missing 时先提示用户配置并确认，但真正的判据是安装能否成功。不要因为预检读不到就断言未配置、反复追问或中止流程。安装时须让子进程继承交互式 shell 的环境（或让用户在其交互式终端执行安装命令）。

安装后核对 lockfile：conan 相关 tarball 应指向所选渠道（GitHub 渠道为 `npm.pkg.github.com/download/@seaverseai/...`）。

## 闸门 2：星云客户端配置（写 env / 初始化文件之前）

星云 SDK 同时支持服务端与客户端接入。`CLIENT_STARUNION_CONFIG` 是**本客户端 Conan 接入**使用的星云后台项目 JSON；服务端 SDK 所需的配置不在本指南范围内。

- **SSR 框架（Next.js 等）**：使用 `CLIENT_STARUNION_CONFIG`，由服务端读取、`JSON.parse` 后经 props 传给客户端初始化组件
- **SPA（Vite 等）**：使用框架要求的公开变量名，如 `VITE_CLIENT_STARUNION_CONFIG`，构建时注入
- **所有框架**：变量写入对应环境的 env 文件或部署平台环境变量，例如 `.env.development` / `.env.production`；**禁止写入 `.env.local`**。文件型的 `.env.development` / `.env.production` 必须提交到仓库，不得加入 `.gitignore`

以项目 JSON 的 `stage` 区分环境：

| `stage` | 对应环境 |
| --- | --- |
| `release` | 开发 / 测试 |
| `production` | 生产 |

首次索取时，必须同时询问 `stage: "release"` 与 `stage: "production"` 两套 `CLIENT_STARUNION_CONFIG`。

用户可以先只提供 `release` 配置。此时可以完成开发/测试环境的接入和验证，但不得编造 `production` 配置、不得在生产文件写空值占位；交付时必须明确写出：“生产环境尚未配置 `CLIENT_STARUNION_CONFIG`，上线前请补齐 `stage: "production"` 的配置，否则不会初始化星云客户端上报。”

`release` 配置也无法提供时，停在接入前，不写依赖、env、初始化文件，不编造、不留 TODO 绕过。

询问话术参考：「集成星云客户端 SDK 需要两套 `CLIENT_STARUNION_CONFIG`：`stage` 为 `release` 的开发/测试配置，以及 `stage` 为 `production` 的生产配置。可以先提供 `release` 配置；生产配置未提供时，我会仅完成开发/测试接入，并在交付中标记上线前必须补齐 `production` 配置。」

### 环境变量落位

SDK 脚本地址按环境固定，变量名统一使用 `CLIENT_` 前缀：

| 环境 | `CLIENT_STARUNION_SDK_SRC` |
| --- | --- |
| dev / test | `https://platform-release.allstarunion.com/webpage/track-sdk/track-sdk.global.js` |
| prod | `https://webpage.allstarunion.com/track-sdk/track-sdk.global.js` |

- 按项目现有的环境组织方式落位。文件型配置使用 `.env.development` / `.env.production`；部署平台管理配置时，分别写入 development / production 环境
- 禁止写入 `.env.local`，不得以本机文件代替开发环境配置
- `.env.development` / `.env.production` 是共享项目配置，必须随实现提交到仓库；若被既有 `.gitignore` 通配规则忽略，添加精确反忽略规则后提交，不得新增忽略规则
- `stage: "release"` 配置已提供时，写入开发/测试环境的 `CLIENT_STARUNION_CONFIG` 和 `CLIENT_STARUNION_SDK_SRC`
- `stage: "production"` 配置已提供时，写入生产环境的 `CLIENT_STARUNION_CONFIG` 和 `CLIENT_STARUNION_SDK_SRC`
- `production` 配置未提供时，只写生产环境固定的 `CLIENT_STARUNION_SDK_SRC`（若项目已有生产环境文件或部署配置），不写空 `CLIENT_STARUNION_CONFIG`；交付中提示用户上线前补齐
- Vite 等要求公开前缀的框架使用 `VITE_CLIENT_STARUNION_CONFIG` / `VITE_CLIENT_STARUNION_SDK_SRC`，其余规则不变

## 框架无关三要素

任何框架的集成都归结为三件事：

1. **SDK 注入**：HTML head（或框架等价物）中 `<script async src={CLIENT_STARUNION_SDK_SRC}>`
2. **初始化时机**：客户端入口尽早调用 init——创建 `StarunionTracker` 单例，init 内 `createConan` 组装插件栈，顺序 **Map → Ad → App → Page → User → starunionPlugin（必须最后**，它处理最终上报数据）；`reporterConfig: { throttleWait: 0, limit: 1 }`（事件交给 StarTrack 处理，Conan 侧立即触发 onReport）、`exposureDelay: 500`
3. **业务数据供给**（官方包不替业务决定的部分，集成时逐项落实或询问用户）：
   - `getPageName` 页面名规则（传给 ConanPluginPage）
   - 用户登录态 → `conanPluginUser.login/logout`
   - deviceId / appVersion 来源
   - `tracker.setLocale / setIp / setCountryCode`
   - `globalProperties`、`extendEvent`（手动事件表）

## 框架适配层

### Next.js App Router（唯一完整骨架，源自公司 CLI 模板验证代码）

文件放置目录默认 `<应用包>/src/track/`，遵项目现有惯例。骨架中 `【适配点】` 注释处需按项目实际情况落实。

#### `src/track/index.ts`

```ts
import { Conan } from '@seaart/conan-core';
import { ConanPluginAd } from '@seaart/conan-plugin-ad';
import { ConanPluginApp } from '@seaart/conan-plugin-app';
import { ConanPluginMap } from '@seaart/conan-plugin-map';
import { ConanPluginPage } from '@seaart/conan-plugin-page';
import { StarunionTracker, type ConanPluginStarunionReportData } from '@seaart/conan-plugin-starunion';
import { ConanPluginUser } from '@seaart/conan-plugin-user';
// 【适配点】storage key 常量：并入项目已有常量文件，或新建（见下文 storage 常量）
import { CookieKey, LocalStorageKey } from '@/constants/storage';
// 【适配点】appVersion 来源：项目 package.json 或构建注入的版本号
import packageJson from '../../package.json';

// 【适配点】cookie 读写：项目已有 cookie util 时替换为项目实现。
// 内网渠道亦可安装 @seaart/utils 使用其 getCookie/setCookie；
// GitHub Packages 镜像渠道无 @seaart/utils，勿依赖，保留以下内联实现即可。
const getCookie = (key: string): string => {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
};
const setCookie = (key: string, value: string) => {
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${365 * 86400}`;
};

/**
 * 手动上报事件名（流程类、异步结果类事件；DOM 能直接触发的用全埋点，不放这里）
 */
export const ReportName = {
  // 示例：ClickExample: 'log_example_click_client',
} as const;

export type ReportName = (typeof ReportName)[keyof typeof ReportName];

/** 手动上报事件的参数类型（与 ReportName 一一对应） */
export type ReportCustomParams = {
  // 示例：[ReportName.ClickExample]: { id: string };
};

/** 页面名称规则
 * 【适配点】i18n 项目需剥离 locale 路由前缀后再匹配；page_name 稳定、不拼具体 id */
const pageNameRules: [RegExp, string][] = [
  [/^\/?$/, 'home_page'],
];

const getPageName = (pathname: string) => {
  for (const rule of pageNameRules) {
    if (rule[0].test(pathname)) return rule[1];
  }
  return pathname;
};

export let conanPluginUser: ConanPluginUser<{ account_type?: number | string }> | undefined;

export const starunionTracker = new StarunionTracker<ReportCustomParams>({
  pendingStorageKey: LocalStorageKey.TrackPendingReports,
  pendingLimit: 100,
  contextNamespace: 'context',
  waitStarTrack: { timeout: 5000 },
});

export const initStarunionTracker = (config: {
  appPlat?: 'app' | 'web' | 'h5' | 'auto';
  globalProperties?: Record<string, unknown>;
  starunionConfig: Record<string, any>;
}) => {
  return starunionTracker.init({
    starunionConfig: config.starunionConfig,
    starTrackInitOptions: {
      setting: {
        devMode: localStorage.getItem(LocalStorageKey.TrackDevMode) === 'true',
        eventLimit: 20,
        timeInterval: 10,
      },
    },
    starunionPluginConfig: {
      appPlat: config.appPlat || 'auto',
      appDeviceId: getCookie(CookieKey.DeviceId) || '',
      appVersion: getCookie(CookieKey.AppVersion) || packageJson.version,
      globalProperties: config.globalProperties,
      extendEvent: Object.values(ReportName),
      defaultAccountType: 2,
      onReport: (reportData) => {
        setCookie(CookieKey.CurrentPlatform, reportData.properties.platform_type || 'web');
        setCookie(CookieKey.CurrentPageName, reportData.properties.current_page_name || '');
        return reportData;
      },
    },
    createConan: (createConanParams) => {
      conanPluginUser = new ConanPluginUser({
        visitorId: getCookie(CookieKey.VisitorId) || '',
        onUpdateVisitorId: (visitorId: string) => setCookie(CookieKey.VisitorId, visitorId),
      });

      const conan = new Conan<ConanPluginStarunionReportData, ReportCustomParams>(
        {
          reporterConfig: { throttleWait: 0, limit: 1 },
          printLog: false,
          exposureDelay: 500,
        },
        [
          new ConanPluginMap({
            useAnchorHrefAsModule: false,
            // 默认全埋点元素：['button', 'a', 'input', 'textarea', 'select']，推荐保持默认
          }),
          new ConanPluginAd({
            adParams: ['ad', 'gad_source', 'gad_campaignid', 'gbraid', 'gclid'],
            adIdParam: 'gclid',
          }),
          new ConanPluginApp({
            deviceId: getCookie(CookieKey.DeviceId) || '',
            onUpdateDeviceId: (deviceId: string) => setCookie(CookieKey.DeviceId, deviceId),
          }),
          new ConanPluginPage({ getPageName }),
          conanPluginUser,
          // 星云转换插件处理最终上报数据，必须放在所有官方插件之后
          createConanParams.starunionPlugin,
        ],
      );

      return { conan };
    },
  });
};

export type { ConanPluginStarunionReportData };
```

#### `src/track/TrackComponent.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { conanPluginUser, initStarunionTracker, starunionTracker } from './index';

interface TrackComponentProps {
  starunionConfig?: Record<string, any>;
}

/** 埋点初始化组件（纯初始化，无 UI、无 context 包装） */
export const TrackComponent = (props: TrackComponentProps) => {
  const [isTrackReady, setIsTrackReady] = useState(false);
  // 【适配点】locale 来源：i18n 项目从其 hook 获取（如 next-intl 的 useLocale）；无 i18n 可省
  // 【适配点】用户登录态来源：项目的用户 store / context；无登录体系则删除登录同步段

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      if (!props.starunionConfig) return; // 无配置不初始化，不阻断页面
      try {
        await initStarunionTracker({ starunionConfig: props.starunionConfig, appPlat: 'auto' });
        if (!cancelled) setIsTrackReady(true);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Track] 星云埋点初始化失败，已跳过。', error);
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  // 【适配点】登录态同步（有用户体系时保留）：
  // useEffect(() => {
  //   if (!isTrackReady || userInfo === undefined) return;
  //   if (userInfo) conanPluginUser?.login(userInfo.id, userInfo.name, { account_type: 2 });
  //   else conanPluginUser?.logout();
  // }, [userInfo, isTrackReady]);

  return null;
};
```

#### 根 layout 注入（`app/**/layout.tsx`）

```tsx
// <head> 内：
<script src={process.env.CLIENT_STARUNION_SDK_SRC} async />

// <body> 内（经懒加载组件挂载；CLIENT_STARUNION_CONFIG 为服务端 env，JSON.parse 需空值保护）：
<LazyComponents
  starunionConfig={process.env.CLIENT_STARUNION_CONFIG ? JSON.parse(process.env.CLIENT_STARUNION_CONFIG) : undefined}
/>
```

挂载组件用 `dynamic(() => import('@/track/TrackComponent'), { ssr: false })` 懒加载，且仅在 `starunionConfig` 存在时渲染。

#### storage 常量（并入项目常量文件或新建）

```ts
export const LocalStorageKey = {
  TrackDevMode: 'track_dev_mode',
  TrackPendingReports: 'track_pending_reports',
} as const;

export const CookieKey = {
  DeviceId: 'device_id',
  VisitorId: 'visitor_id',
  AppVersion: 'app_version',
  UserInfo: 'user_info',
  CurrentPlatform: 'sv_platform',
  CurrentPageName: 'sv_page_name',
} as const;
```

#### env 文件

```bash
# .env.development
CLIENT_STARUNION_CONFIG='<stage 为 release 的星云后台项目 JSON>'
CLIENT_STARUNION_SDK_SRC='https://platform-release.allstarunion.com/webpage/track-sdk/track-sdk.global.js'

# .env.production
CLIENT_STARUNION_CONFIG='<stage 为 production 的星云后台项目 JSON>'
CLIENT_STARUNION_SDK_SRC='https://webpage.allstarunion.com/track-sdk/track-sdk.global.js'
```

### Next.js Pages Router（要点）

- SDK script 注入放 `pages/_document.tsx` 的 `<Head>`
- TrackComponent 挂载放 `pages/_app.tsx`（同样 dynamic ssr:false + 配置存在才渲染）
- `CLIENT_STARUNION_CONFIG` 经 `getInitialProps` / 服务端注入下发，不走 `NEXT_PUBLIC_`

### Vite React SPA（要点）

- SDK script 注入 `index.html` 的 `<head>`
- 应用入口（`main.tsx`）渲染前或首屏组件内调用 init
- 配置下发按闸门 2 的用户确认结果执行；使用 `VITE_CLIENT_STARUNION_CONFIG` 和 `VITE_CLIENT_STARUNION_SDK_SRC`，未确认不写初始化代码

### Vue SPA（要点）

- 适配锚点：`main.ts` 创建应用后立即调用 init
- 登录态在用户 store（Pinia 等）变更处同步 `conanPluginUser.login/logout`
- 配置下发按闸门 2 确认结果

### Nuxt（要点）

- 适配锚点：`plugins/conan.client.ts`（`.client` 后缀保证仅客户端执行）
- 配置经 `runtimeConfig` 下发

### 其他框架（Svelte / Angular / Astro 等）

不套用未经验证的骨架，走受控适配流程：

1. **读取现状**：项目入口文件、路由结构、状态管理方案、现有 env/配置下发方式
2. **起草适配方案**：按"框架无关三要素"落到具体文件——script 注入点、init 调用点与时机、登录态同步点、配置下发路径（闸门 2 约束仍然生效）
3. **确认后动手**：方案（含将要新建/修改的文件清单）给用户确认后再实施

## 集成后验证（分级）

**完整验收（能运行项目时执行，达成后才可报告"已验证"）**：

1. 项目自身 build 命令通过
2. 启动项目，浏览器 `localStorage.setItem('track_dev_mode', 'true')` 后刷新，console 输出埋点事件（至少 `log_page_expose_client`）
3. Network 面板：`track-sdk.global.js` 加载成功；有指向 `CLIENT_STARUNION_CONFIG` 中 `agent_uri` 的上报请求
4. 回跑 `scripts/check-conan.mjs`，确认 `code: full`

**降级验收（无法运行/无浏览器环境时）**：完成第 1、4 条 + 静态核对，交付时必须标注「仅构建验证，未验证上报」，并把第 2、3 条列为用户待办。
