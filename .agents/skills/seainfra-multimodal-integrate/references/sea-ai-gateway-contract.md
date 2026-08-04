# SeaInfra AI Gateway 多模态 SDK 契约

## 固定配置

- 公共服务端点通过 `SEA_BASE_URL` 配置，公开地址为 `https://seainfra.ai`。
- `SEA_API_KEY` 只允许服务端使用。
- 多模态调用还需要从实时 modal catalog 选择精确任务模型 ID，并读取该模型的实时 schema。
- 禁止推断 provider alias、静默回退其他模型或复用 LLM 请求体。

## SDK 安装

| 运行时 | 安装 | Client |
|---|---|---|
| Node.js 18+ ESM | `npm install git+https://github.com/SeaArt-Infra/sea-sdk-js.git` | `Client` from `sea_sdk_js` |
| Go | `GOPROXY=direct go get github.com/SeaArt-Infra/sea-sdk-go@main` | `sa.New` |
| Python 3.10+ | `pip install --upgrade git+https://github.com/SeaArt-Infra/sea-sdk-python.git` | `seaart_sdk` |

## SDK 方法

| 工作负载 | Node.js | Go | Python |
|---|---|---|---|
| Modal discovery | `client.modal.listModels` | `client.Modal.ListModels` | `client.modal.list_models` |
| Modal schema | `client.modal.getModelSkill` | `client.Modal.GetModelSkill` | `client.modal.get_model_skill` |
| Modal task | `client.modal.create` then `task.wait()` | `client.Modal.Create` then `task.Wait` | `client.modal.create` then `task.wait()` |
| Precharge | `client.modal.precharge` | `client.Modal.Precharge` | `client.modal.precharge` |

LLM 方法属于 `client.llm`，不用于本契约。LLM 接入由项目的协议门禁 Skill 负责。

## 异步任务顺序

1. 使用 `listModels` 按目标输入/输出模态和能力筛选。
2. 让用户选择精确任务模型 ID。
3. 使用 `getModelSkill` 获取实时 schema；schema 决定参数直接位于 `params`，还是嵌套于 `input` / `parameters`。
4. 使用精确 `model`、可选 `moderation` 和 `input` 数组创建任务；input item 包含模型专属 `params`。
5. 持久化 task ID。
6. 使用 SDK wait helper 或有界轮询等待终态，并支持取消。
7. 成功时读取任务输出内容 URL；失败时保留 task ID 和受控错误供支持排查，不自动重提计费任务。

需要预计费用时，用与实际任务相同的 body 调用 `precharge`。缺失 estimate 是明确状态，不得解释为零。

## 媒体与安全边界

- 输入媒体 URL 必须能被网关访问，并先校验 URI scheme、大小、格式和时长。
- 不向 `client.modal` 发送 `messages`、`max_tokens` 或 LLM streaming 字段。
- 不假设生成产物立即可用；不默认公开上游 URL。
- 用户图片可使用 URI 或 base64 做安全扫描；视频/音频扫描需要 URI。安全扫描必须与生成任务终态分离。

## 运行边界

- 设置请求截止、轮询间隔、总超时和用户取消。
- catalog 能力、上下文限制和价格是实时事实源，不硬编码 provider 假设。
- 只记录模型 ID、task/request ID、耗时、状态和必要用量；默认不记录输入媒体、生成内容或密钥。
- `401`/`403` 检查密钥权限；`404` 检查模型 ID 和端点；`429`/`5xx` 返回可重试操作状态，但收到响应后不盲目重提生成任务。

## 验收最小集

1. SDK 和凭证完全位于服务端。
2. 精确模型 ID 来自实时目录，且保存了对应 schema 证据。
3. task ID 已持久化，轮询有界，终态和错误分离。
4. 完成输出受访问控制；可选 precharge 使用相同 body。
5. 最小依赖/build/typecheck 通过，并执行一个脱敏真实任务。
