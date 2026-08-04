# 埋点信息归一化与确认表规范

> 适用场景：分支 B（已集成）。用户给的埋点信息可能很"乱"——截图表格、口头描述、混杂服务端/客户端事件。本文规定如何定位需求、解析归一化、确认表怎么输出、以及确认门禁。

## 1. 输入形态与追问

接受任意形式：表格截图、markdown/excel 粘贴、口头描述、文档链接。

- 用户**未提供**埋点信息时，主动追问直到获得（拿到前不动手）：
  > 「请提供埋点需求，任意形式均可（文档/表格/截图/口述）。我至少需要：事件名（或业务动作）、触发时机、要上报的参数。」
- **截图输入**：先复述提取到的行数与列名（防解析漏行），再归一化
- 解析后仍缺的信息（参数取值来源、枚举含义等）：在确认表中标 ❓ 待确认，**不猜**
- 原始表中被划线/删除的字段：与用户确认是否弃用，不默认带上

## 2. 需求定位（归一化之前必做）

确认表的"目标文件/组件"、"DOM 属性"与"参数来源"必须来自代码定位证据，不允许凭空填写。逐条需求执行：

1. **定位落点**：目标路由/页面 → 组件 → 交互 handler（点击/提交/生命周期）；参数的数据来源（路由参数 / 接口返回字段 / store / 计时计算）
2. **检索既有埋点**（防重复实现）：
   - ReportName 常量表与 extendEvent：是否已有同名或同义事件
   - 目标组件及其父级的 `data-conan-*` 属性：点击/曝光是否已被自动埋点覆盖
   - registerReportContext：所需字段是否已由上下文注入（避免重复传参）
   - getPageName 规则：页面类需求是否已被插件自动覆盖
3. **标注结论**：已覆盖 → 确认表该行标「复用既有实现」并写明位置；定位不到 → 标 ❓，交由用户补充，不猜

## 3. 归一化规则（原始信息 → 标准字段）

### 端口 / 平台列

原始表常见 web / h5 / app 标记：只实施 **web / h5**；app 行标 🚫 out-of-scope（本 skill 只覆盖前端 Web 项目）。

### 事件分类（决定"埋点方式"列）

| 原始事件特征 | 归一化结果 |
| --- | --- |
| `_server` 后缀（如 log_register_server、log_login_server） | 🚫 服务端埋点，前端不实施；备注「如需前端同步上报，请提供对应 `_client` 事件定义」 |
| `log_page_expose_client` / `log_page_leave_client` | 🤖 插件自动（ConanPluginPage，含 page_view 停留毫秒）；该行任务收敛为「检查/扩展 getPageName 覆盖对应路由」 |
| `log_click_client` | 优先 🏷 DOM 自动（`data-conan` 属性）；仅当点击后依赖异步结果或需运行时计算参数时才 ✋ 手动 |
| 元素/模块曝光 | 🏷 DOM 自动（`data-conan-event="exposure"`，官方自动事件名 `log_element_expose_client`）；列表曝光需稳定 exposure-key |
| 自定义事件（如 log_work_expose_client / log_work_leave_client）及表单提交、生成任务、支付、搜索、异步结果 | ✋ 手动 `tracker.report`（事件名**必须加入 extendEvent**） |
| 涉及 focus / blur / hover / scroll / stay / page_suspend / page_resume | 对应方式照上，但额外标注「需 allowEvent 开启」（默认只上报 page_view / page_leave / click / exposure） |

### 参数归一化

- 参数名统一 **snake_case**
- `current_page_name` / `ref_page_name`：标「插件自动附带，无需手动传」
- **数值参数**（如 status 枚举、page_view / work_view / duration 毫秒）：类型列强制标 `number` + 单位或枚举含义；含义不明标 ❓
- 参数来源必须写清（route param / 接口返回 / 组件 props / 插件自动 / 计时计算…），写不清的标 ❓

## 4. 确认表格式（必须以此格式输出）

```
| # | 事件名 | 触发时机 | 埋点方式 | 目标文件/组件 | DOM 属性 | 参数（名:类型:来源） | 状态 |
```

- **埋点方式**取值：🏷 DOM自动 / ✋ 手动report / 🤖 插件自动 / ♻️ 复用既有实现 / 🚫 out-of-scope
- **目标文件/组件**：必须来自需求定位证据（文件路径 + 组件/handler 名）；定位不到标 ❓
- **DOM 属性**：DOM 自动事件写完整的 `data-conan="..."` 和 `data-conan-module="..."`；属性在祖先元素上时注明祖先元素。其他埋点方式填 `—`
- **参数列**格式示例：
  - `work_id: string ← 路由参数 slug`
  - `page_view: number(ms) ← 插件自动计算`
  - `status: number(0=成功/1=失败) ← ❓ 枚举含义待确认`
- 曝光类行须注明去重 key 取值（`data-conan-exposure-key` 来源）；涉及非默认事件（focus/hover/stay 等）的行须注明「需 allowEvent 开启」
- **表后必附**：
  1. out-of-scope 清单及原因（服务端事件、app 端口等）
  2. ❓ 待确认项汇总
  3. 全局影响汇总：本次需新增的 allowEvent 项、extendEvent 变更、getPageName 新增规则
  4. 每条的验证动作（DevMode 下的触发路径与预期上报事件/字段）
  5. 结束语：「请确认以上 N 条埋点方案（可指出需修改的行号）。确认后开始实施。」

## 5. 硬规则（确认门禁）

- ⛔ 用户**明确确认前禁止修改任何代码**；用户提出修改 → 更新表格重新确认，再等确认
- 确认后把最终表格落档到 `<应用包>/docs/tracking/plan-YYYYMMDD.md`（YYYYMMDD 为当天日期），作为对账与验收依据
- 实施为**幂等操作**：每条动手前复核该事件/属性未被既有实现覆盖（需求定位可能过时——代码在确认期间可能变化），重复则跳过并在结果表注明
- 实施完成后输出**实施结果表**：确认表原样 + 每行落地位置（文件:行）+ 状态（✅ / ♻️ 复用 / ⏭️ 跳过原因）+ 验证级别（已验证上报 / 仅构建验证），格式见 `report-api.md`
