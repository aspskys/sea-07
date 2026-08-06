# SeaInfra / AI 中台全流程接入手册（Agent 一键执行版）

> **读者：** 任意 coding agent（Grok / Claude / Codex 等）  
> **目标：** 读完本文件即可在目标仓库内完成 SeaInfra 接入编排 → 分模块接入 → 验收 → 最后一公里判定。  
> **禁止：** 凭对话记忆宣称「已完成」；无证据文件不得 `complete`；测试结论不得复制到 production。

**权威 Skill 目录（相对仓库根）：** `.agents/skills/`  
**事实源：**

| 文件 | 作用 |
|---|---|
| `.agents/seainfra/config.json` | 配置与来源（要接什么、凭证、场景） |
| `.agents/seainfra/state.json` | 进度（做到哪一步） |
| `.agents/seainfra/evidence/*.json` | 验收证据（唯一可证明 completed） |
| `.agents/seainfra/probes/` | 协议探测、渠道检查、e2e 探针 |

**总编排 Skill：** `$seainfra-onboarding` → `.agents/skills/seainfra-onboarding/SKILL.md`  
**最后一公里：** `$seainfra-completion-check` → `.agents/skills/seainfra-completion-check/SKILL.md`  
**契约：** `.agents/skills/seainfra-onboarding/references/contract.md`

---

## 0. 硬规则（先读再动手）

1. **状态机：** `not_selected → selected → integrating → checking → completed`（可进 `blocked`）。
2. **`completed` 只能由配对 Check Skill 在写出合法 evidence 后调用 `complete` 写入。** Integrate 不得标 completed。
3. **证据三层：** `static` / `connectivity` / `e2e`，每层 `passed` 或 `not_applicable`+`reason`；evidence 条目禁止「已检查/正常/OK」空话。
4. **环境隔离：** `test` 与 `production` 分别配置、分别验收。test 的 `stage`/凭证结论不得继承 production。
5. **依赖：** `search_recommend` 要求同环境 `data_sync=completed`。
6. **密钥：** 可进 `config.json` / `.env.development`/`.env.production`；**不得**写入 evidence、普通日志、聊天复述全文密钥。
7. **生产副作用**（真实扣款、正式埋点、投放）：必须用户再次明确确认。
8. **最后一公里：** 用户问「接完了吗」必须先跑 `verify-completion.mjs`；只认 `verdict`。

### 完成等级（勿混淆）

| verdict | 含义 | 能否对业务说「接入完成」 |
|---|---|---|
| `not_ready` | 有缺口或假 completed | 否 |
| `test_closure` | 用户明确测试收口 | 否（只能说测试可停） |
| `env_ready` | 该环境全部 selected 模块 formal completed + 证据审计 pass | 是（该环境） |
| `ship_ready` | test + production 均为 env_ready | 是（可上线） |

---

## 1. 一键命令速查

```bash
# 进入目标仓库根目录
cd <repo-root>

# --- 编排 ---
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs init
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs status
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs select llm multimodal content_safety data_sync tracking payment search_recommend ads_acquisition
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs provision --env test
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs validate --env test
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs begin <module> --env test
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs check-start <module> --env test
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs block <module> --env test --reason "..."
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs complete <module> --env test --evidence .agents/seainfra/evidence/<file>.json

# --- 最后一公里 ---
pnpm seainfra:completion:json          # 或 node .../verify-completion.mjs --env test --json
pnpm seainfra:completion:deep
pnpm seainfra:completion:fix           # 假 completed 自动 block
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --mode env --env test
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --mode ship --json

# --- 支付沙盒业务回调 e2e（本仓库已实现时）---
PAYMENT_SANDBOX_SIMULATE=1 node --import tsx scripts/payment-sandbox-e2e.mjs
```

若根目录无 `pnpm seainfra:completion*` 脚本，直接使用 `node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs ...`。

---

## 2. 模块路由表（必须读对应 SKILL）

| 模块 | Integrate | Check | 前置 |
|---|---|---|---|
| content_safety | `seainfra-content-safety-integrate` | `seainfra-content-safety-check` | AI 网关 SEA_* |
| llm | `seainfra-llm-integrate` | `seainfra-llm-check` | SEA_*；协议探测后用户选协议 |
| multimodal | `seainfra-multimodal-integrate` | `seainfra-multimodal-check` | SEA_*；catalog + getModelSkill |
| data_sync | `seainfra-data-sync-integrate` | `seainfra-data-sync-check` | DB/只读/mapping |
| tracking | `seainfra-tracking-integrate` → client/server 子 skill | `seainfra-tracking-check` | 星合 JSON；**test 要 stage=release，production 要 stage=production** |
| payment | `seainfra-payment-integrate` | `seainfra-payment-check` | 星河凭证；**channel_check 必须覆盖 channels** |
| search_recommend | `seainfra-search-recommend-integrate` | `seainfra-search-recommend-check` | **data_sync=completed** + 推荐 HTTP API |
| ads_acquisition | `seainfra-ads-acquisition-integrate` | `seainfra-ads-acquisition-check` | AF/或业务指定买量方案 |
| **总闸门** | — | **`seainfra-completion-check`** | 全部 selected 处理完后 |

**推荐执行顺序（默认）：**

```text
1. content_safety
2. llm
3. multimodal
4. data_sync
5. tracking（与业务并行亦可）
6. payment
7. search_recommend   # 必须在 data_sync completed 之后
8. ads_acquisition    # 可与支付并行，常 defer 给专项团队
9. seainfra-completion-check
```

内容安全应在处理用户输入/生成内容的 AI 路径**设计上**先于或同步于 LLM/多模态落点。

---

## 3. 全流程 Phase（Agent 逐步执行）

### Phase A — 启动与探测

1. `cd` 到**目标业务仓库根**（含 `package.json` / App 入口）。
2. 确认存在 `.agents/skills/seainfra-onboarding`；若无，先从已维护仓库拷贝整个 `.agents/skills/seainfra-*` 与 `seainfra-completion-check`。
3. 读 `AGENTS.md` / 项目 README，记录技术栈证据（框架、API 目录、是否已有 analytics/支付）。
4. 运行：
   ```bash
   node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs init
   node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs status
   ```
5. 向用户展示 8 模块清单，**一次性确认**本轮选择（未选保持 `not_selected`）。  
   - 若用户说「全选」：`select` 全部 8 个（`search_recommend` 会自动带上 `data_sync` 依赖逻辑，仍建议显式 select data_sync）。

### Phase B — 开通清单（provision）

```bash
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs provision --env test
# 生产另开一轮：
# node ... provision --env production
```

按输出联系对应平台（**不要在日志打印密钥值**）：

| capability | 联系 | 关键字段 |
|---|---|---|
| ai_gateway | SeaInfra 团队 | `SEA_BASE_URL`, `SEA_API_KEY`（LLM/多模态/安全共用） |
| tracking | 星合数据平台 | 完整 `CLIENT_STARUNION_CONFIG` / `SERVER_STARUNION_CONFIG` JSON |
| payment | 星河支付 | client_id, client_key/pubkey, jwt_pubkey, server_key/pubkey, gateway, sdk_src, channels |
| data_sync | SeaInfra / 数仓 | database_type, database, objects, network, 连接信息 |
| search_recommend | 推荐平台 | project_id, scenes, submission_url；后续 **HTTP 召回 API** |
| ads_acquisition | 买量/归因团队 | provider, app_id, credentials, platforms, events |

**写入配置：** 平台返回后写入 `config.json` → `environments.<env>.<module>`。  
- tracking：**整份 JSON 原样**写入 `client_config` / `server_config`，不要只摘 key。  
- payment：旧字段 `signing_key/public_key` 可作 server 别名。

### Phase C — 配置校验

```bash
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs validate --env test
# payment 进 check 前：
node ... validate payment --env test --phase check
# llm 探测前：
node ... validate llm --env test --phase probe
```

缺字段 → `block <module> --reason "..."` 并向用户只要**缺失项**。

### Phase D — 分模块接入（模板）

对每个 selected 模块：

```text
1. 完整阅读 .agents/skills/seainfra-<module>-integrate/SKILL.md（及 references）
2. manage begin <module> --env test
3. 按 Integrate 实施代码/配置（不编造协议/字段）
4. manage check-start <module> --env test
5. 完整阅读并执行 seainfra-<module>-check
6. 写 evidence JSON 到 .agents/seainfra/evidence/
7. manage complete <module> --env test --evidence <path>
   失败则 block，禁止 complete
```

### Phase E — 最后一公里

```bash
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --env test --json
# 若 falseCompleted 非空：
node ... --fix-false-completed --json
# 上线前：
node ... --mode deep --env test --json
node ... --mode ship --json
```

对外话术必须与 `verdict` 一致。

### Phase F — 生产环境

test 全部目标模块处理完后，**单独**对 production：`provision` → 配凭证 → validate → integrate/check → completion。  
**禁止**把 test 的 evidence 路径直接 complete 到 production。

---

## 4. 分模块执行要点（实操清单）

### 4.1 content_safety

- **Skill：** integrate + check  
- **配置：** `base_url`, `api_key`, `content_types[]`, `policy`  
- **实现约束：** 官方 `sea_sdk_js`；`Client` 的 base 常需去掉 `/llm` 后缀；方法 `modal.scanTextContent` / `scanImage` 等以 README 为准。  
- **验收：** 真实 scan 成功 + 坏 key 失败路径 + 路由接入用户输入/出图。  
- **证据示例字段：** req_id、level、decision 映射（勿写全文 key）。

### 4.2 llm

- **Skill：** integrate + check  
- **配置：** `base_url`, `api_key`, `model`, `timeout_ms`；探测后写 `protocol` + `protocol_probe`  
- **协议门禁：**
  ```bash
  node .agents/skills/seainfra-llm-integrate/scripts/probe-llm-protocols.mjs
  ```
  只允许用户从 **`supported`** 列表中选一个；写入 config 与 sources。  
- **常见协议：** `openai_responses` / `openai_chat_completions`（以探测为准）。  
- **验收：** 非流式真请求成功 + 错误模型失败 + 业务 adapter 路径。

### 4.3 multimodal

- **Skill：** integrate + check  
- **配置：** `base_url`, `api_key`, `capabilities[]`, `models{capability: modelId}`  
- **事实源：** 实时 modal catalog + `getModelSkill` schema（禁止凭记忆编 schema）。  
- **实现：** 官方 Sea SDK 异步任务 create/get/poll；task id 可恢复。  
- **验收：** 至少一个 capability 真创建任务成功；注意计费，复跑可用既有 task 证据但需注明。

### 4.4 data_sync

- **Skill：** integrate + check  
- **配置：** `database_type`, `database`, `objects[]`, `network_access`, 非 firebase 时连接串/`read_only=true`  
- **交付物：** `bigdata_config/data-sync-config.md` + `table-mapping.md`（`业务表 → sync_业务表`）  
- **脚本：**
  ```bash
  node .agents/skills/seainfra-data-sync-check/scripts/check-data-sync.mjs --json
  ```
- **验收：** 静态 mapping 合法 + 源库连通 + 数仓/CDC 落表证据（无 Redshift 直连时可用平台 CDC 截图/工单路径作 evidence，须可定位）。

### 4.5 tracking

- **Skill：** `seainfra-tracking-integrate` →  
  - client: `seainfra-tracking-client-integrate`（Conan）  
  - server: `seainfra-tracking-server-integrate`  
  - check: `seainfra-tracking-check`  
- **配置：**
  - `surfaces`: `["client"]` | `["server"]` | 两者  
  - `client_config` / `server_config`：**完整平台 JSON**  
  - **stage 门禁：** test 环境 JSON 必须 `stage=release`；production 必须 `stage=production`  
  - server 额外：`v_sign_key`, `v_sign_pub_key`  
- **Client 要点：**
  - GitHub 源：`@seaart/conan-*` npm alias → `@seaverseai/*`，需要 `NODE_AUTH_TOKEN`（read:packages）  
  - 配置写入 `.env.development` / `.env.production`，**禁止 `.env.local`**  
  - 业务事件须确认表；DOM 优先 `data-conan-*`  
- **探针：**
  ```bash
  node .agents/skills/seainfra-tracking-client-integrate/scripts/check-conan.mjs --json
  node .agents/skills/seainfra-tracking-server-integrate/scripts/check-starunion-server.mjs --json
  ```
- **验收：** 真实上报 +（可用时）starry report_stat；**仅有配置或 init 成功不算 completed**。

### 4.6 payment

- **Skill：** integrate + check；渠道文档可参考 `starry-cli/publish`（cashier-integration）  
- **配置：** client_id, client_key, client_pubkey, jwt_pubkey, server_key, server_pubkey, gateway_base_url, sdk_src, callback_base_url, business_types, channels  
- **channel_check（强制）：**
  ```bash
  # 用 server key 调
  POST {gateway}/open_api/payment/method_list
  ```
  将**实际返回渠道**写入 `channel_check.enabled_channels`，且必须覆盖 `channels`。  
  - 申请 Adyen/PayPal 但平台只有 PayerMax → **改 channels 或开通渠道**，不能硬 complete。  
- **实现最小闭环：**
  - 创单 Open API 签名（RSA-OAEP 请求签）  
  - 回调原始 body RSA 验签 + 金额/身份校验 + 幂等发货  
  - 查单接口  
- **沙盒业务回调（无平台 RSA 私钥时）：**
  - 平台创单用真实 Open API  
  - 本地业务回调可用 `PAYMENT_SANDBOX_SIMULATE=1` + HMAC 沙盒签（**生产禁止开启**）  
  - 脚本参考：`scripts/payment-sandbox-e2e.mjs`  
  - **诚实声明：** 沙盒 HMAC ≠ 平台真实推送；浏览器渠道实付另记  
- **验收：** validate --phase check + 成功回调发货 + 重复回调不重复发货 + 坏签/金额错误路径。

### 4.7 search_recommend

- **Skill：** integrate + check  
- **前置：** 同环境 data_sync **completed**  
- **步骤：** 分析业务 SKU → 用户确认 intake 字段 → POST integration-intakes → 等推荐 HTTP API → 实现场景接口（pt/request_id/canary 透传）→ 埋点曝光点击  
- **无推荐 API 文档时：** `block`，写清「等平台/鸣人返回接口」；**intake 成功 ≠ completed**。

### 4.8 ads_acquisition

- **Skill：** integrate + check（描述偏 AppsFlyer）  
- **若业务明确「天宇对接拉卡拉、产品不管」：** `block` 或 `not_selected`，notes 写清 owner，**不要伪实现**。  
- **验收：** SDK/归因/转化至少一条真实链路。

---

## 5. 证据 JSON 模板（complete 前必写）

路径：`.agents/seainfra/evidence/<module>-<env>-<ISO时间>.json`

```json
{
  "schemaVersion": 1,
  "module": "<module>",
  "environment": "test",
  "result": "passed",
  "checkedAt": "2026-08-04T00:00:00.000Z",
  "sourceRefs": [
    ".agents/skills/seainfra-<module>-check/SKILL.md",
    "相关代码路径",
    "探针或官方文档 URL"
  ],
  "checks": {
    "static": {
      "status": "passed",
      "evidence": ["可定位命令或文件，≥8 字符，非空话"]
    },
    "connectivity": {
      "status": "passed",
      "evidence": ["脱敏 request id / HTTP 码 / 探针路径"]
    },
    "e2e": {
      "status": "passed",
      "evidence": ["业务入口→结果；含失败路径一条"]
    }
  },
  "notes": ["限制与未覆盖项"]
}
```

然后：

```bash
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs complete <module> --env test --evidence <上述路径>
```

`complete` 要求当前状态为 `checking`（先 `check-start`）。

---

## 6. 用户输入收集清单（缺什么问什么）

复制给用户填写：

```text
【环境】test / production / 两者
【模块】勾选：llm multimodal content_safety data_sync tracking payment search_recommend ads_acquisition

【AI 网关】SEA_BASE_URL / SEA_API_KEY
【LLM】model 名；是否已有偏好协议（否则探测后选）
【多模态】需要的 capability + 模型 id（或「按 catalog 推荐」）
【内容安全】content_types；拦截策略文案
【数据同步】库类型/地址/只读账号/表清单
【埋点】client/server JSON（注意 stage）；surfaces；埋点方案表（可选）
【支付】星云/星河配置文档或字段；callback 公网域名；业务类型；目标渠道
【搜推】场景名；SKU 表；用户 ID 语义；推荐 HTTP（若有）
【买量】provider/app_id 或「defer 给某某团队」
```

---

## 7. 常见翻车点（本仓库实战）

| 现象 | 原因 | 处理 |
|---|---|---|
| tracking validate 失败 stage | test 配了 `stage=production` 的 JSON | 换 release JSON，或明确只在 production 环境验收 |
| Conan 403 | 无 `read:packages` / 无 org 权限 | 配置 NODE_AUTH_TOKEN；未装包不得 completed |
| payment channels 校验失败 | 申请 Adyen 但 method_list 只有 PayerMax | channels 与 method_list 对齐 |
| 说「收到充值成功」但只是 e2e | 沙盒 HMAC 本地回调 | 如实说明；真回调需公网 notify + 实付 |
| search 卡死 | 无推荐 API | block 等平台；不要假 complete |
| agent 胡说完成 | 未跑 completion-check | 强制 `verify-completion.mjs` |
| typecheck 红 | 声明了 conan 但未 install | 装包或隔离 tracking 编译 |

---

## 8. 标准交付输出（每轮结束必须给用户）

```markdown
## SeaInfra 进度
- env: test|production
- selected: ...
- 表格：模块 | state | evidence | blockers | 下一步

## 最后一公里
- command: verify-completion.mjs ...
- verdict: ...
- falseCompleted: []
- 能否说「接入完成」: 是/否（依据 verdict）

## 用户待办（若有）
- 缺的配置/平台联系人/确认项
```

---

## 9. 最小「全绿」路径（理想 test）

1. 全选模块（或业务确认子集）  
2. 配齐 AI 网关 + 跑通 safety/llm/multimodal check → complete  
3. data_sync mapping + 连通/CDC → complete  
4. tracking release JSON + Conan 安装 + 真上报 → complete  
5. payment 凭证 + method_list 对齐 + 沙盒/沙箱回调 e2e → complete  
6. 推荐 API 到达后 search → complete  
7. ads 配齐或 not_selected  
8. `verify-completion.mjs --mode env --env test` → **env_ready**  
9. production 重复 2–8 → `--mode ship` → **ship_ready**

---

## 10. Agent 启动提示词（可直接粘贴）

```text
你是 SeaInfra 接入 agent。严格按仓库内：
.agents/seainfra/AGENT-FULL-ONBOARDING-PLAYBOOK.md
与 .agents/skills/seainfra-onboarding/SKILL.md
执行 AI 中台全流程接入。

要求：
1. 先 init/status，再让用户确认模块与环境。
2. 每个模块先读对应 integrate/check SKILL，再改代码。
3. completed 必须有 evidence + manage complete；禁止口述完成。
4. 结束前跑 verify-completion.mjs，按 verdict 汇报。
5. 密钥不写进 evidence/聊天全文。
6. test 与 production 分开验收。

现在从 Phase A 开始，目标仓库即当前 workspace。
```

---

## 11. 相关路径索引

| 用途 | 路径 |
|---|---|
| 本手册 | `.agents/seainfra/AGENT-FULL-ONBOARDING-PLAYBOOK.md` |
| 编排 | `.agents/skills/seainfra-onboarding/` |
| 完成判定 | `.agents/skills/seainfra-completion-check/` |
| 完成标准 | `.agents/skills/seainfra-completion-check/references/completion-criteria.md` |
| 管理脚本 | `.agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs` |
| 审计脚本 | `.agents/skills/seainfra-completion-check/scripts/verify-completion.mjs` |
| CI 门禁 | `.github/workflows/seainfra-completion.yml` |
| 支付沙盒 e2e | `scripts/payment-sandbox-e2e.mjs` |
| 配置/状态 | `.agents/seainfra/config.json` / `state.json` |

---

**文档版本：** 2026-08-04  
**维护原则：** 流程/门禁变更时，同步更新本文件与 `seainfra-onboarding`、`seainfra-completion-check` SKILL。
