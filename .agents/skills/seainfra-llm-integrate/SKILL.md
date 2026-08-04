---
name: seainfra-llm-integrate
description: 通过协议探测门禁将 SeaInfra 文本大模型或 LLM 网关接入 Web、API 或后端应用。用户提到 LLM 接入、模型网关、OpenAI/Anthropic 协议、文本生成、对话模型、流式输出、模型路由、Base URL 或 API Key 配置时使用。不使用 SDK 作为接入门禁；完成后必须转交 seainfra-llm-check。
---

# SeaInfra LLM 接入

先读 `.agents/skills/seainfra-onboarding/references/contract.md`、统一配置和状态。只处理 `llm` 模块。

## 协议发现门禁

不要因为用户只提供了 `base_url`、`api_key` 和 `model` 就索取整套网关文档或猜测协议。先运行探测前校验：

```bash
node .agents/skills/seainfra-onboarding/scripts/manage-seainfra.mjs validate llm --env <环境> --phase probe
node .agents/skills/seainfra-llm-integrate/scripts/probe-llm-protocols.mjs --env <环境>
```

脚本从统一配置读取密钥，不接受命令行密钥。测试环境可直接执行最小请求；生产环境必须先取得用户明确确认，再传 `--confirm-production`。不得用手写 `curl` 替代内置脚本。

向用户展示每个协议的状态、HTTP 状态和脱敏原因：

- `supported`：成功响应且结构匹配，可供选择。
- `endpoint_detected`：端点返回标准错误，但未走通，不得宣称支持。
- `unsupported`：端点明确返回 404/405。
- `inconclusive`：鉴权失败、超时、网络错误或响应结构不匹配。

一次只询问用户选择哪个 `supported` 协议：`openai_chat_completions`、`openai_responses` 或 `anthropic_messages`。不要替用户选择。选择后把协议写入 `protocol`，报告路径写入 `protocol_probe`；在 `sources.llm` 登记报告及报告内对应的 `spec_url`。报告只证明被测环境、模型和非流式最小请求，不证明流式、工具调用或所有错误语义。

若没有 `supported` 协议，执行 `block llm`，下一步只处理探测报告指出的鉴权、模型或连通性问题。不得把 `endpoint_detected` 自动升级为支持。

## 接入流程

1. 确认 `llm` 已选择，按上述流程完成协议探测和用户选择，再运行完整 `validate llm --env <环境>`。
2. 从代码证据识别实际调用边界：服务端、浏览器、后台任务、流式接口或队列消费者。确认本期一个最小业务用例、输入、输出和失败语义。
3. 读取探测报告和所选协议官方资料，记录协议版本、鉴权、端点、请求响应、流式格式、限流、超时、错误码和模型能力。探测未覆盖且来源未定义的行为保持未实现；不得把是否安装某个 SDK 作为通过条件。
4. 搜索已有模型客户端、代理层和同义调用；优先复用，禁止产生第二套散落客户端。
5. 执行 `begin llm --env <环境>`，在项目惯例下实现集中适配层。业务代码只传业务输入；Base URL、凭证、模型、超时和重试从统一配置映射到运行环境。
6. 对输入长度、输出结构、取消、超时、限流、网关错误和无效响应给出明确处理。只有来源允许的错误才重试，且设置次数与总时限。
7. 流式响应必须处理客户端断开、服务端取消、半截输出和资源释放；非流式调用不得假装支持流式。
8. 添加与风险相称的单元测试/集成测试，运行项目既有格式化、类型检查、测试或构建。
9. 记录变更位置、运行命令和仍未验证项，执行 `check-start llm`，转交 `$seainfra-llm-check`。本 Skill 不得写 `completed`。

## 完成边界

接入完成只表示代码与配置已准备验收。真实网关可达、模型返回有效、业务路径成功和失败策略生效均由 Check Skill 判定。
