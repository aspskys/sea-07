---
name: seainfra-tracking-client-integrate
description: 接入 SeaInfra/StarUnion 的 Conan 客户端埋点。当用户明确提到前端埋点、客户端打点、浏览器上报、曝光/点击埋点、Conan、tracking、analytics event、log_*_client，或提供客户端埋点需求表格、文档、截图时使用。只处理客户端探测、SDK 接入、自动埋点和手动事件实施；最终统一验收由 seainfra-tracking-check 负责。
---

# SeaInfra 客户端埋点接入（Conan）

星云 SDK 同时支持服务端与客户端埋点。本 skill 是**只处理客户端埋点**的通用版，会被放入不同技术栈、不同目录结构的前端项目；它处理浏览器页面、DOM 交互和客户端业务流程事件。服务端 SDK、服务端环境变量、服务端 API、消息队列、数据库写入和所有 `_server` 事件均不在范围内。**禁止假设任何固定路径或框架**，一切以 Step 0 探测结果为准。官方规范出处：《星云最佳实践》 https://aiart-conan-web.dev.seaart.dev/starunion-best （规范细节的可执行摘要见 `references/report-api.md`）。

被 `$seainfra-tracking-integrate` 调用时，先从统一配置读取当前环境 `tracking.client_config`；缺失时返回父 Skill 联系星合数据平台开通，不绕过统一配置另存一份。

## Step 0：探测（每次触发必做）

优先运行只读审计脚本（脚本绝不写文件）：

```bash
node <本 skill 目录>/scripts/check-conan.mjs --json
```

输出关键字段：`apps`（前端应用包候选及框架/包管理器）、`code`（代码接入：full/partial/none）、`config`（运行配置：ready/unknown/missing）、`packageSource`（internal-npm/github-packages/unknown，按 git remote 判定）、`missing`、`warnings`。

- `apps` 有多个候选或 `framework: "unknown"` → 向用户确认目标应用
- `warnings` 中带 `confidence: low` 的项 → 读实际代码复核，脚本只给证据不下结论
- **脚本失败或 node 不可用时的手工兜底**：① Glob 全部 package.json（排除 node_modules）找含前端框架依赖的应用包；② 检查其 dependencies 是否含 7 个 `@seaart/conan-*` 包（版本值可能是 semver 或 `npm:@seaverseai/...` alias，两种都算已安装）；③ Grep `StarunionTracker` 定位初始化文件，并确认 init 函数在该文件之外被调用；④ Grep `CLIENT_STARUNION_SDK_SRC` 与对应环境 env 中的 `CLIENT_STARUNION_CONFIG`；⑤ `git remote get-url origin` 判定包源

## 状态路由

| code | 动作 |
| --- | --- |
| `none` | 分支 A：完整集成引导（读 `references/integration.md`） |
| `partial` | 列出 missing 清单，按分支 A **只补缺**；已有文件先读再 diff，不得覆盖 |
| `full` | 分支 B：埋点需求处理 |

`config` 非 `ready` 时附带提醒：env 无 `CLIENT_STARUNION_CONFIG` 痕迹**不等于**未集成（可能注入在部署平台），与用户确认后再定。

## 分支 A：集成引导

读 `references/integration.md` 执行。两道闸门通过前**不写任何文件、不装任何依赖**：

1. **闸门 1（包源渠道）**：按 git remote 静默判定（公司规则）——github.com → GitHub Packages 镜像；其他 host → 内网 npm；**无 git remote 才询问用户**。GitHub 渠道需向用户索取 NODE_AUTH_TOKEN 相关凭据
2. **闸门 2（星云客户端配置）**：优先读取统一配置中的 `tracking.client_config`。独立使用本 Skill 且配置缺失时，转交 `$seainfra-onboarding` 联系星合数据平台按环境开通；`stage: "release"` 对应开发/测试，`stage: "production"` 对应生产。不得编造配置或在另一位置私建事实源。映射到项目 env 时仍遵守下方环境文件规则。

集成完成后：用项目自身 build 命令验证，再询问用户是否继续处理具体埋点需求（转分支 B）。

## 分支 B：埋点需求处理

1. **收集**：用户未提供埋点信息 → 主动追问直到获得："请提供埋点需求，任意形式均可（文档/表格/截图/口述）。我至少需要：事件名（或业务动作）、触发时机、要上报的参数。"
2. **需求定位**（写确认表之前，先在代码中落实每一条需求）：
   - 定位目标路由/页面/组件、交互 handler、参数数据来源（路由参数 / 接口返回 / store / 计时）
   - 检索既有埋点：ReportName 常量表、extendEvent、`data-conan-*` 属性、registerReportContext、同义事件；已覆盖的需求标注"复用既有实现"，不重复埋
   - 定位不到的项在确认表标 ❓，不猜
3. **归一化**：读 `references/event-table.md`，把原始信息（可能杂乱）解析成标准**确认表**输出给用户。截图输入先复述提取到的行数与列名，缺失信息标 ❓ 待确认。DOM 自动事件在确认表中展示拟采用或复用的 `data-conan` 和 `data-conan-module`
4. **⛔ 确认门禁**：用户明确确认前**禁止修改任何代码**；用户提出修改 → 更新表格重新确认
5. **落档**：确认后把表格保存为 `<应用包>/docs/tracking/plan-YYYYMMDD.md`
6. **幂等实施**：读 `references/report-api.md`，按确认表逐条落地；每条动手前复核该事件/属性未被既有实现覆盖（重复则跳过并在结果表注明）
7. **验证与交付**（分级，不得虚报）：
   - **已验证上报**：能运行项目时——启动、进入目标页面、触发交互，核对 console 事件与发往 `agent_uri` 的请求中事件名/字段正确
   - **仅构建验证**：无法做浏览器/网络验证时——build 通过 + 静态核对，结果表必须标注「仅构建验证，未验证上报」，不得声称已验证
   - 输出**实施结果表**（确认表 + 每行落地位置 文件:行 + 状态 + 验证级别）

## 硬规则

- 手动事件名 `log_{business_action}_client`，参数 snake_case；手动事件必须加入 `extendEvent`
- `_server` 后缀事件 = 服务端埋点，前端**不实施**，确认表标 out-of-scope
- `log_page_expose_client` / `log_page_leave_client` 由 ConanPluginPage 自动上报（含 page_view 毫秒），不要手动实现，只需保证 getPageName 规则覆盖对应路由
- `current_page_name` / `ref_page_name` 由插件自动附带，业务不手动传
- 星云插件默认只上报 page_view / page_leave / click / exposure；focus、blur、hover、scroll、stay、page_suspend、page_resume 需在 `allowEvent` 显式开启
- 本客户端接入的星云配置必须写入对应环境（如 `.env.development` / `.env.production` 或部署平台的 development / production 环境变量），**禁止写入 `.env.local`**
- `.env.development` / `.env.production` 是共享配置，必须提交到仓库；若既有 `.gitignore` 通配规则忽略了它们，添加精确反忽略规则后提交，**不得将这两个文件加入忽略规则**
- 优先自动埋点（DOM `data-conan-*`）；仅当 DOM 事件无法表达业务结果（异步结果、流程完成、失败原因）才手动 report
- GitHub Packages 渠道下业务代码、三方代码、构建产物一律使用 `@seaart/*` import；`@seaverseai` 只允许出现在 package.json 的 alias 与 .npmrc

## 职责边界

本 Skill 的验证结果只作为接入证据，不得把统一状态写成 `completed`。客户端实施完成后返回 `$seainfra-tracking-integrate`；全部已选 surface 接入完成后，由 `$seainfra-tracking-check` 统一执行最终验收。
