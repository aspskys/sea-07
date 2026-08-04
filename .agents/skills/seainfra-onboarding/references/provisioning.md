# SeaInfra 配置开通流程

## 固定流程

1. 研发确认本轮模块和环境。
2. 运行 `manage-seainfra.mjs provision --env <环境>`。
3. 按输出联系 SeaInfra 对应能力团队开通配置；清单只展示字段名和配置状态，不展示值。
4. 团队返回配置后写入 `.agents/seainfra/config.json` 对应环境。
5. 重新运行 `provision` 确认团队配置字段齐全，再执行模块 `validate` 和 Integrate Skill。

## AI 网关合并申请

只要选择 `llm`、`multimodal`、`content_safety` 中任一项，就合并为一张 AI 网关开通单：

- `SEA_BASE_URL`
- `SEA_API_KEY`
- 需要开通的能力：仅列已选模块
- 环境：`test` 或 `production`

不要向 SeaInfra 团队索取 `SEA_MODEL_ID`、模型请求参数、内容安全策略或审核方法作为凭证字段：

- LLM 在凭证齐全后按 `$seainfra-llm-integrate` 执行协议探测门禁，模型值作为探测输入。
- 多模态在凭证齐全后读取实时 modal catalog 和模型 schema，再选择并记录模型。
- 内容安全在凭证齐全后根据输入类型和产品策略选择官方 scan 方法。

## 星合数据平台埋点申请

选择 `tracking` 后联系星合数据平台，申请：

- `CLIENT_STARUNION_CONFIG`
- `SERVER_STARUNION_CONFIG`

两项都按环境申请完整 JSON。`test` 使用 `stage=release`，`production` 使用 `stage=production`。具体字段与校验见 `$seainfra-tracking-integrate` 的 `references/platform-config.md`。

## 星河支付平台申请

选择 `payment` 后联系星河支付平台，申请：

- `client_id`
- `client_key` / `client_pubkey`
- `jwt_pubkey`
- `server_key` / `server_pubkey`
- `gateway_base_url`
- `sdk_src`
- 目标 `channels` 的开通回执

提交业务类型、运行端、包名/应用标识、回调地址和渠道清单。收到配置后仍需用当前环境 key 执行只读平台查询或 Payment SDK 检查；具体格式见 `$seainfra-payment-integrate` 的 `references/platform-credentials.md`。

## 联系模板

```text
【SeaInfra 能力开通申请】
项目：<项目名称/标识>
环境：test / production
需要开通的模块：<provision 输出中的模块>
需要提供的配置：<provision 输出中的字段名>
回调、公网域名、包名或其他模块信息：<仅填写对应模块明确要求的内容>
研发联系人：<姓名>
计划联调时间：<时间>
```

收到配置前保持模块为 `selected`；如果团队确认暂不能开通，使用 `block <module> --reason <原因>`。测试与生产分别申请，不把测试凭证默认复用到生产。
