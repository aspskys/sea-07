# SeaInfra Content Safety SDK 契约

## 固定配置

- 公共服务端点通过 `SEA_BASE_URL` 配置，公开地址为 `https://seainfra.ai`。
- `SEA_API_KEY` 只允许服务端使用。
- 不得把密钥、原始审核内容、base64 媒体、完整扫描响应或用户标识写入浏览器代码、提交 fixture 或普通日志。

## 方法选择

| 输入与意图 | SDK 方法 | 完成字段 | 决策字段 |
|---|---|---|---|
| 敏感词与组合规则 | `scanText` | `status.code == 10000` | `data.is_sensitive`、`data.sensitive_words` |
| 短文本类别与风险等级 | `scanTextContent` | `ok == true` | `level`、`label`、`reason`、`req_id` |
| 图片或视频 | `scanImage` | `ok == true` | `nsfw_level`、`risk_types`、`label_items` |
| 图片加结构化文案 | `scanVisualStructuredTextFusion` | `ok == true` | `nsfw_level`、`risk_keys`、`issue_source`、`req_id` |

基础文本审核优先 `scanText`；依赖类别和严重度的 policy 使用 `scanTextContent`。输入类型或 policy 不明确时必须先确认。

## SDK 安装

| 运行时 | 安装 | Client |
|---|---|---|
| Node.js 18+ ESM | `npm install github:SeaArt-Infra/sea-sdk-js` | `Client` from `sea_sdk_js` |
| Go | `go get github.com/SeaArt-Infra/sea-sdk-go@v0.2.6` | `sa.New` |
| Python 3.10+ | `pip install --upgrade seaart_sdk==0.1.4` | `seaart_sdk` |

## 跨语言方法

| 工作负载 | Node.js | Go | Python |
|---|---|---|---|
| 敏感词文本 | `client.modal.scanText` | `client.Modal.ScanText` | `client.modal.scan_text` |
| 短文本内容 | `client.modal.scanTextContent` | `client.Modal.ScanTextContent` | `client.modal.scan_text_content` |
| 图片/视频 | `client.modal.scanImage` | `client.Modal.ScanImage` | `client.modal.scan_image` |
| 图片+文案 | `scanVisualStructuredTextFusion` | `ScanVisualStructuredTextFusion` | `scan_visual_structured_text_fusion` |

融合方法要求结构化文本，以及图片 URI 或图片 base64。图片扫描接受 URI 或 base64；视频扫描使用 URI 和 `is_video: true`。

## 决策边界

1. 先验证方法专属完成字段。
2. 再把结果归一化为 `allow`、`review`、`block` 或 `unavailable`。
3. 最后应用产品明确 policy；没有 policy 时不得硬编码通用阈值。
4. 扫描失败不得自动批准；调用方必须选择 fail-open、fail-closed 或 manual-review。

限制输入长度、附件大小和 URI scheme。保留请求 ID 用于追踪，不默认向终端用户返回上游原始原因。

## 错误处理

- `401`/`403`：检查 API Key 权限。
- `429`/`5xx`：扫描未完成，进入配置的 unavailable policy。
- `400`：修正输入结构后再决定是否重试。
- 不对含糊响应自动重发；只对明确可重试的传输失败执行有界重试。

## 验收最小集

1. SDK 和凭证完全位于服务端。
2. 方法与输入类型匹配，并验证正确完成字段。
3. 扫描完成、policy 决策、unavailable 三种状态分离。
4. 普通日志不含原始敏感内容、base64 或 API Key。
5. 依赖解析与最小 build/typecheck 通过，并验证一个安全正向路径和一个受控 policy 路径。
