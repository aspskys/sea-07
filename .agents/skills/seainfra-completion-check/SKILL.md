---
name: seainfra-completion-check
description: SeaInfra 接入「最后一公里」完成判定。用户问是否接完了、能否相信 agent 说完成、验收标准、总验收、final check、completion gate、上线门禁、假 completed、自动 block、深度复验、CI 门禁，或要求复审 onboarding 全模块完成度时使用。只做机器可复核的证据审计，不实施接入，不因用户口头或 agent 叙述而把状态改成 completed。
---

# SeaInfra 完成判定（最后一公里）

**本 Skill 是唯一允许对外宣称「中台接入完成 / 可上线」的总闸门。**  
禁止相信对话里的「已经接完」。只认：状态文件 + Check 证据 + 本脚本 exit code。

先读 `../seainfra-onboarding/references/contract.md` 与 `references/completion-criteria.md`。

## 三条硬能力（必须会用）

| # | 能力 | 命令 |
|---|---|---|
| 1 | **CI 门禁** | PR 自动跑 evidence integrity（见 `.github/workflows/seainfra-completion.yml`） |
| 2 | **假 completed 自动 block** | `--fix-false-completed` |
| 3 | **深度机械复验** | `--mode deep`（可选 `--live`）+ 输出各模块 Check Skill 清单 |

## 固定入口

```bash
# 1) 日常审计（有假 completed 则 exit 1）
pnpm seainfra:completion:json
# 或
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --env test --json

# 2) 发现假 completed 时打回 blocked（改 state.json）
pnpm seainfra:completion:fix
# 或
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs \
  --env test --fix-false-completed --json

# 3) 深度：重跑可脚本化探针 + 列出需 agent 重跑的 *-check
pnpm seainfra:completion:deep
# 真网关（有凭证时）：
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs \
  --mode deep --live --env test --json

# 环境 / 上线口径
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --mode env --env test
node .agents/skills/seainfra-completion-check/scripts/verify-completion.mjs --mode ship --json

# 单元测试
pnpm seainfra:completion:test
```

## 完成等级

| verdict | 含义 | 能否说「接入完成」 |
|---|---|---|
| `not_ready` | 缺口或假 completed | 否 |
| `test_closure` | 用户测试收口 | 否（只能说测试可停） |
| `env_ready` | 该环境全部 selected formal complete | 是（该环境） |
| `ship_ready` | test+production 均为 env_ready | 是（可上线） |

## 工作流

### Step 0 — 先跑脚本

禁止先写结论。必须先执行 `verify-completion.mjs`，再引用其 `verdict` / `falseCompleted` / `failures`。

### Step 1 — 审计与假完成处理

1. 跑 `--mode audit --env <env> --json`。
2. 若 `falseCompleted.length > 0`：
   - **必须**告知用户：存在假 completed，不可信。
   - 征得同意后（或用户明确要求严谨收口时）跑 `--fix-false-completed`。
   - 不得把假 completed 继续当完成汇报。
3. CI 在 PR 上自动执行 audit；**不要求** env_ready（避免测试项目永远红灯），但 **禁止** 假绿勾。

### Step 2 — 深度复验（用户要求「真去查」/ 上线前）

1. 跑 `--mode deep --env <env>`（默认无 live 网络）。
2. 对 `status=completed` 的模块：深度探针失败 = 审计失败。
3. 对未完成模块：深度结果记为 precheck warning，并输出 `checkSkill` / `agentChecklist`。
4. Agent 必须按清单 **完整调用** 对应 `$seainfra-*-check`（不得跳过 e2e）。
5. 需要真网关时加 `--live`；生产扣款/上报仍须用户确认。

### Step 3 — 输出格式（强制）

```markdown
## 完成判定
- verdict: ...
- falseCompleted: [...]
- script exit: ...

| 模块 | state | evidence | deep | 缺口 |
|---|---|---|---|---|

### 下一步
- 一条动作（fix / check skill / 找人要配置）
```

### Step 4 — 状态回写

| 动作 | 谁做 |
|---|---|
| `block` 假 completed | 本脚本 `--fix-false-completed` 或 agent 等价调用 |
| `complete` 模块 | **仅**配对 Check Skill 在实测通过后 |
| 本 Skill `complete` 模块 | **禁止** |

可写汇总：`--write-report .agents/seainfra/evidence/completion-....json`。

## CI 行为（已配置）

工作流：`.github/workflows/seainfra-completion.yml`

- **PR / push（相关路径）**：`audit` test + production + 脚本单测  
  - exit 1 条件：任一模块 `completed` 但证据/交叉规则失败  
  - 不强制 `env_ready`（测试收口项目仍可通过，只要不装假）
- **workflow_dispatch**：可选 `deep` / `env` / `ship` / `fix_false_completed`

## 禁止事项

- 因 agent 说完成而写 completed  
- 因用户测试收口而写 completed（只记 test_closure）  
- 证据空话（已检查/正常/OK）  
- 跨环境复制结论  
- deep 未跑 live 却声称连通已实测  

## 一句话

**完成 = 机器审计 pass +（深度时）探针 pass + Check 证据可复核。**  
口述、收口备注、只 validate、只 integrate，一律不够。
