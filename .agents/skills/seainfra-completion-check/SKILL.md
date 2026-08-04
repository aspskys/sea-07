---
name: seainfra-completion-check
description: SeaInfra 接入「最后一公里」完成判定。用户问是否接完了、能否相信 agent 说完成、验收标准、总验收、final check、completion gate、上线门禁、模块 completed 是否可信，或要求复审 onboarding 全模块完成度时使用。只做机器可复核的证据审计，不实施接入，不因用户口头或 agent 叙述而把状态改成 completed。
---

# SeaInfra 完成判定（最后一公里）

**本 Skill 是唯一允许对外宣称「中台接入完成 / 可上线」的总闸门。**  
禁止相信对话里的「已经接完」「闭环了」「验证过了」。只认：

1. 统一状态文件 `state.json`
2. 配对 Check 写出的 **证据 JSON**（格式合法且内容可定位）
3. 本 Skill 脚本的 **exit 0 审计结果**
4. （深度模式）各模块 Check Skill 的重新执行结果

本 Skill **不**代替 `seainfra-*-check`；它 **审计** 那些 check 的产物是否足以支撑 `completed`。

先读 `../seainfra-onboarding/references/contract.md` 与 `references/completion-criteria.md`。

## 何时触发

- 用户问：接完了吗 / 能不能信 agent / 完成标准 / 最后一公里 / final check / 总验收
- onboarding 全部 selected 模块声称完成后的汇总验收
- 正式上线前门禁
- 怀疑「agent 胡说接完了」时的复审

## 禁止事项（反胡说）

| 禁止 | 正确做法 |
|---|---|
| 因 agent 说「已验证」写 completed | 要求 evidence 文件 + 脚本 audit pass |
| 因用户说「测试觉得可以」写 completed | 记 `test_closure` 备注，**不得** `complete` |
| 只跑 `validate` 就宣称完成 | validate 只证明配置字段存在，不证明连通/业务 |
| 证据里写「已检查/正常/OK」 | 证据条必须含 **可复核定位**（路径、命令、request id、平台单号前缀） |
| 把另一环境结论复制过来 | 按 `--env` 隔离 |
| 本 Skill 直接 `complete <module>` | 只允许各模块 **Check Skill** 在本环境实测后 `complete` |
| 依赖未 completed 时宣称 search_recommend 完成 | 依赖门禁失败则整体 fail |

## 完成等级（必须区分）

| 等级 | 含义 | 能否对业务说「接入完成」 |
|---|---|---|
| `not_ready` | 缺配置 / 缺证据 / 审计失败 | **否** |
| `test_closure` | 用户明确收口测试范围；部分模块未 formal complete | **否**（只能说「测试阶段可停」） |
| `module_completed` | 单模块 `state=completed` 且证据审计通过 | 仅该模块 |
| `env_ready` | 该环境 **全部 selected** 模块均为 `module_completed` | **是（该环境）** |
| `ship_ready` | `test` 与本期要求的 `production` 均为 `env_ready`，且生产无未确认副作用 | **是（可上线口径）** |

默认用户问「接完了吗」时：  
- 若仅 `test_closure` → 回答 **测试可停，未 formal 完成**  
- 仅当 `env_ready` / `ship_ready` → 才可说 **该环境 / 可上线已完成**

## 固定入口（机器审计，先跑）

从项目根：

```bash
# 审计当前环境：状态 + 证据文件质量 + validate + 依赖
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --env test

# 仅看选中模块、输出 JSON
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --env test --json

# 正式上线口径（test + production）
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --mode ship --json
```

脚本 **exit 0** 仅当对应模式判定通过。  
Agent 报告结论时必须粘贴或引用脚本输出中的 `verdict` 与 `failures[]`，禁止只写自然语言摘要。

## 工作流

### Step 0 — 范围

1. 读 `config.json` / `state.json`，列出 `selected=true` 的模块与目标 `--env`。
2. 向用户确认模式（若未说明）：
   - `audit`：只审计，给缺口清单（默认）
   - `env`：该环境是否 `env_ready`
   - `ship`：是否 `ship_ready`
3. **不要**在本步改业务代码。

### Step 1 — 机器审计（必做）

运行 `verify-completion.mjs`。对每个 selected 模块检查：

1. **状态机**：`completed` 必须有 `evidence` 路径；`integrating`/`blocked`/`checking` 不得被叙述成完成。
2. **证据文件存在**且 `module`/`environment`/`result=passed` 与 state 一致。
3. **三层检查**：`static` / `connectivity` / `e2e` 均为 `passed` 或带 `reason` 的 `not_applicable`。
4. **证据质量**：每层 `evidence[]` 非空；拒绝空话（见脚本 `VAGUE_PATTERNS`）。
5. **配置**：`validate <module> --env` 无 missing（payment check 阶段另验 `channel_check`）。
6. **依赖**：`search_recommend` 要求同环境 `data_sync=completed`。
7. **交叉谎言检测**（启发式，失败则记 warning 或 failure，见 criteria 文档）：
   - tracking `completed` 但 `check-conan` 显示依赖未安装
   - payment `completed` 但无 `channel_check` 或 requested 渠道不在 `enabled_channels`
   - 证据时间戳早于配置最后更新且无复跑记录（warning）

### Step 2 — 深度复验（用户要求「真去查」或 ship 模式时）

对每个 **尚未 completed** 或 **证据可疑** 的 selected 模块：

1. `check-start <module> --env <环境>`（配置不齐则 block）
2. **完整调用**配对 Check Skill（路由表同 onboarding），不得跳过连通/e2e
3. Check 通过后由 **该 Check Skill** 写证据并 `complete`
4. 再跑一遍 `verify-completion.mjs`

深度复验中生产真实扣款/上报/投放必须再次取得用户确认。

### Step 3 — 输出格式（强制）

向用户输出一张表，不得用「基本完成」含糊带过：

```markdown
## 完成判定 <env> / <mode>
- verdict: env_ready | test_closure | not_ready | ship_ready
- script: verify-completion.mjs exit <code>
- selected: N · completed_ok: N · failed: N · deferred: N

| 模块 | state | 证据审计 | 缺口 |
|---|---|---|---|
| ... | ... | pass/fail/n/a | ... |

### 不可信声明（若有）
- 列出 agent/用户曾声称完成但审计失败的项

### 下一步唯一动作
- 一条可执行动作（跑哪个 check / 找谁要配置）
```

### Step 4 — 状态回写规则

- 审计失败：**不得**把任何模块标 `completed`。
- 可写 `state.testProjectClosure` 或模块 `notes`（用户明确测试收口时）。
- 仅当某模块 Check 本次真实通过时，由该 Check 调用 `complete`。
- 本 Skill 可写汇总证据：  
  `.agents/seainfra/evidence/completion-<mode>-<env>-<timestamp>.json`  
  （`result=passed` 仅当 verdict 为 `env_ready` 或 `ship_ready`）

## 与现有 Skill 关系

```text
onboarding
  → *-integrate（改代码）
  → *-check（单模块三层验收 → complete）
  → seainfra-completion-check（总闸门：信不信 completed）
```

| 角色 | Skill |
|---|---|
| 编排 | `seainfra-onboarding` |
| 单模块验收 | `seainfra-*-check`（8 个） |
| **最后一公里** | **`seainfra-completion-check`（本 Skill）** |

## 模块 → Check 路由（深度复验用）

| 模块 | Check Skill |
|---|---|
| llm | `$seainfra-llm-check` |
| multimodal | `$seainfra-multimodal-check` |
| content_safety | `$seainfra-content-safety-check` |
| data_sync | `$seainfra-data-sync-check` |
| tracking | `$seainfra-tracking-check` |
| payment | `$seainfra-payment-check` |
| search_recommend | `$seainfra-search-recommend-check` |
| ads_acquisition | `$seainfra-ads-acquisition-check` |

## 一句话标准

**「接入完成」= 该环境全部 selected 模块均为 `state.completed`，且每条证据通过 `verify-completion.mjs` 机器审计，且依赖与渠道等交叉规则无 failure。**  
用户口头收口或 agent 自述，最多记为 `test_closure`，永远不等于 `env_ready`。
