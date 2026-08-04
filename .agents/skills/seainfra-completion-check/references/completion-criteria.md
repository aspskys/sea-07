# 接入完成判定标准

## 1. 为什么需要最后一公里

单模块 Check 已要求 static / connectivity / e2e 证据，但仍可能出现：

- Agent 未跑 Check 就口头「完成」
- 写了 evidence 但内容是「已检查」无法复核
- `state.completed` 与仓库现实不一致（依赖未装、渠道未开）
- 用户测试收口被误报成正式完成

本文件定义 **可机器执行** 的通过条件；自然语言叙述一律不足信。

## 2. 证据最低标准

证据文件：`.agents/seainfra/evidence/<module>-<environment>-<timestamp>.json`

必须满足 `manage-seainfra.mjs complete` 的全部校验，并且：

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 存在且为 1（或项目约定版本） |
| `module` / `environment` | 与 state 条目一致 |
| `result` | 必须是 `passed` |
| `checkedAt` | ISO 时间 |
| `sourceRefs` | 非空数组；至少一条可定位路径或 URL |
| `checks.static\|connectivity\|e2e` | `passed` 或 `not_applicable`+`reason` |
| `checks.*.evidence` | **非空数组**；每条 ≥ 8 字符 |
| 空话 | 不得整条仅为：已检查、正常、通过、OK、passed、done、looks good、verified（大小写不敏感） |

### 可接受的证据样例

- `pnpm typecheck exit 0`
- `lib/ai-client/chat.ts chat() Responses HTTP 200 model=gpt-5.5`
- `probe-llm-protocols.mjs --env test report=...`
- `create_order code=20000 sys_order_id_prefix=0140… unpaid`
- `check-conan.mjs code=full packages present 7/7`

### 不可接受

- `已检查`
- `功能正常`
- `agent 已验证`
- `用户说可以了`（可进 notes，不能单独当 e2e）

## 3. 分层含义（与 contract 对齐）

| 层 | 必须证明 | 常见伪通过 |
|---|---|---|
| static | 配置可加载、代码在正确边界、构建/类型/关键静态探针 | 仅 package.json 有依赖名 |
| connectivity | 用**当前环境真实凭证**打通平台/网关 | DNS 通、404 端点存在、validate 字段齐 |
| e2e | **业务入口**走到结果/持久化/展示，含至少一条失败路径 | 只单测 mock、只创单未回调、只 init SDK |

生产副作用（扣款、正式上报、投放）无用户确认时，connectivity/e2e 只能 `not_applicable`+reason，不能伪装实测。

## 4. 分模块「完成」硬条件摘要

| 模块 | 额外硬条件 |
|---|---|
| llm | `protocol` + 同环境 `protocol_probe` 中该协议为 `supported`；真实 chat/responses 成功 |
| multimodal | catalog/schema 有据；create/get task 成功且结果可访问策略明确 |
| content_safety | 官方 SDK 方法；至少一类内容真实 scan；策略映射到拦截/放行 |
| data_sync | 源库连通；`sync_*` 映射；新鲜度或平台 CDC 证据 |
| tracking | 已选 surface 均有配置 stage 匹配；Conan/server 探针与真实上报/落库（或明确 N/A 原因）；不能仅有 env JSON |
| payment | `validate --phase check`；`channel_check.enabled_channels` **覆盖全部** `channels`；创单+回调验签+幂等发货（测试/沙箱） |
| search_recommend | 同环境 `data_sync=completed`；intake 有据；**真实推荐 HTTP** 返回可排序结果；埋点透传 |
| ads_acquisition | provider 凭证；安装/深链/转化事件至少一条真实归因链路 |

## 5. 交叉谎言检测（脚本启发式）

| 信号 | 处理 |
|---|---|
| tracking completed 但 `node_modules` 无 conan 且 check-conan missing 依赖 | **failure** |
| payment completed 但缺 `channel_check` 或渠道未覆盖 | **failure** |
| search_recommend completed 但 data_sync 非 completed | **failure** |
| state.completed 但 evidence 文件不存在 | **failure** |
| evidence 与 config 中 project_key/client_id 等关键标识无法交叉（若证据写了脱敏前缀） | warning |
| `userAcceptedTestClosure=true` 且 status≠completed | 允许 `test_closure`，**禁止**报 env_ready |

## 6. test_closure vs env_ready

**test_closure（测试收口）**

- 用户明确：「测试项目到此为止 / 可以停」
- 允许部分模块 blocked/integrating
- 对外话术：**测试阶段可暂停，非正式接入完成**

**env_ready（环境接入完成）**

- 该环境全部 selected 模块：`status=completed` + 证据审计 pass + validate pass + 依赖 pass
- 对外话术：**&lt;env&gt; 环境中台接入完成**

**ship_ready**

- `test` 为 env_ready，且用户要求的 production 亦为 env_ready
- 生产无「未确认真实扣款/投放」的 N/A 冒充

## 7. 审计输出字段（脚本 JSON）

```json
{
  "verdict": "not_ready|test_closure|env_ready|ship_ready",
  "environment": "test",
  "mode": "audit|env|ship",
  "modules": [
    {
      "module": "llm",
      "selected": true,
      "state": "completed",
      "evidenceAudit": "pass|fail|skip",
      "failures": [],
      "warnings": []
    }
  ],
  "failures": [],
  "warnings": [],
  "nextAction": "一条下一步"
}
```

## 8. Agent 报告诚信条款

1. 先跑脚本，再说话。
2. `verdict` 必须与脚本一致；不得美化。
3. 若用户问「能不能信 agent」：引用本标准与最近一次脚本 `failures`。
4. 发现历史 `completed` 证据不合格：执行 `block <module> --reason evidence_audit_failed: ...`，要求重跑 Check。
