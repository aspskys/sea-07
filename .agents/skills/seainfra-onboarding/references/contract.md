# SeaInfra 接入契约

## 1. 事实文件

- 配置：`.agents/seainfra/config.json`
- 状态：`.agents/seainfra/state.json`
- 验收证据：`.agents/seainfra/evidence/<module>-<environment>-<timestamp>.json`

配置描述“要接什么、依据什么、每个环境使用什么”；状态只描述“进行到哪里”。模块 Skill 不得私建另一套总进度文件。

## 2. 模块标识

只允许：`llm`、`multimodal`、`content_safety`、`data_sync`、`tracking`、`payment`、`search_recommend`、`ads_acquisition`。

每个模块必须有：

1. 至少一个权威 `source`，包含类型、位置、适用范围；
2. 测试与生产配置独立对象；
3. 接入前可验证的配置字段；
4. 配对的 Integrate Skill 与 Check Skill；
5. 可定位到文件、命令、请求或平台记录的验收证据。

依赖关系：`search_recommend` 强制依赖同环境的 `data_sync=completed`。选择搜索推荐时自动选择数据同步；映射文档存在、配置已交付或同步任务已创建都不能替代 Check 通过。

## 3. 状态机

```text
not_selected -> selected -> integrating -> checking -> completed
                                 |            |
                                 +-> blocked <-+
```

- `selected`：用户已选择，但可能缺配置。
- `integrating`：来源和目标范围已确认，正在修改目标项目。
- `checking`：接入改动完成，正在验收。
- `completed`：配对 Check Skill 生成通过证据后写入。
- `blocked`：明确记录缺失字段、缺失资料或外部依赖；补齐后可回到 `integrating` 或 `checking`。

## 4. 验收证据格式

```json
{
  "schemaVersion": 1,
  "module": "llm",
  "environment": "test",
  "result": "passed",
  "checkedAt": "2026-07-29T00:00:00.000Z",
  "sourceRefs": ["权威文档或 Skill 定位"],
  "checks": {
    "static": { "status": "passed", "evidence": ["命令或文件定位"] },
    "connectivity": { "status": "passed", "evidence": ["脱敏请求 ID 或响应摘要"] },
    "e2e": { "status": "passed", "evidence": ["实际业务路径和结果"] }
  },
  "notes": []
}
```

`status` 只允许 `passed` 或 `not_applicable`；`not_applicable` 必须带非空 `reason`。证据不得只写“已检查”或“正常”。

## 5. 环境规则

- `test` 与 `production` 的 Base URL、凭证、应用/项目标识和模型/渠道配置分别保存。
- 当前 demo 阶段允许凭证直接保存在统一配置中；模块实施时从该文件映射到应用运行配置，不把凭证复制进验收证据、普通日志或其他说明文档。
- 先验收 `test`。不得因同一凭证或同一 URL 被复用，就把测试结论复制为生产结论。
- 生产环境默认只做无副作用检查；需要真实写入或业务动作时再次确认并在证据中记录确认范围。

## 6. 来源规则

来源优先级：当前能力官方 Skill > 当前版本官方文档 > 项目中已验证实现 > 用户明确提供的内部文档。示例代码、第三方同名 SDK、搜索结果和模型常识不能单独成为接口事实源。

若来源之间冲突，停止实施并列出冲突字段、各自来源和需要确认的决策；禁止静默择一。

## 7. LLM 协议发现

LLM 的 `base_url`、`api_key`、`model` 和 `timeout_ms` 齐全后，允许在尚无 `sources.llm` 和 `protocol` 时执行只读最小协议探测。探测报告是当前环境、端点、鉴权方式和模型组合的实测来源，不外推到其他环境、模型、流式能力、错误码或扩展字段。

只有返回成功且响应结构匹配标准协议的结果才标为 `supported`。标准错误结构只证明端点存在，标为 `endpoint_detected`；401/403、网络错误、超时和非标准响应标为 `inconclusive`；404/405 标为 `unsupported`。用户必须在 `supported` 结果中明确选择协议，之后把报告路径写入 `protocol_probe`，把选择写入 `protocol`，并在 `sources.llm` 登记探测报告与协议官方资料。完整接入校验仍要求来源、所选协议和报告齐全。

## 8. 配置开通

模块选择后、代码实施前必须生成 SeaInfra 团队配置开通清单。`provision` 只输出字段名和是否已配置，禁止输出配置值。

LLM、多模态、内容安全共享 AI 网关开通规则：团队侧字段只有 `SEA_BASE_URL` 与 `SEA_API_KEY`。LLM 协议、模型与探测报告，多模态模型目录与 schema，内容安全方法与业务 policy 都属于拿到凭证后的接入决策，不得混入凭证申请。

埋点模块由星合数据平台开通，返回客户端与服务端项目配置 JSON。支付模块由星河支付平台开通，返回客户端、JWT、服务端 Open API 凭证，并按申请开通支付渠道。所有配置按 `test` 与 `production` 分开保存。

支付 `begin` 只要求平台配置与目标渠道已登记；进入 Check 前还必须运行 `validate payment --phase check`。`channel_check` 必须同时引用平台开通回执和使用当前环境 key 完成的只读平台查询或 Payment SDK 运行记录。仅有凭证、回执、创单 `2xx` 或 SDK 初始化成功均不能单独证明目标渠道已开通。
