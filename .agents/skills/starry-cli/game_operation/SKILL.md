---
name: starry-cli-game-operation
description: >-
  使用 starry-cli game_operation 易创 调用自定义函数 处理各类业务，
  用户的需求描述找不到合适的能力时，
  按照用户用语言描述，结合 game_operation 提供的详细能力，调用对应API。
---

# Game Operation

文中的 `starry-cli ...` 是语义命令，实际执行用 wrapper 并原样传参.

```bash
starry-cli game_operation call_func --code <能力code> --params '<JSON对象>'
```

## 规则

- 获取 game operation 易创 的能力通过执行 `starry-cli game_operation api_list --jsonl > ./.starry-cli-game-operation-apis.jsonl && grep -i '<关键词>' ./.starry-cli-game-operation-apis.jsonl`。
- 后续再次检索 `grep -i '<关键词>' ./.starry-cli-game-operation-apis.jsonl`，你需要考虑这个文件实时性。
- JSONL 中一行就是一个完整能力规范；grep 命中后只阅读命中的行，再根据该行的 `code`、`params_schema`、`returns_schema` 调用。
- 不要猜测能力 code、参数字段或返回字段；只使用 JSONL 命中行或「已知能力」中 JSON 规范块列出的信息。
- `return_type=2` 的列表能力，默认追加 `--page 1 --limit 20`，用户要求更多数据时再调整分页。
- 用户没有提供必需参数时，先向用户确认；不要用空值、占位值或猜测值调用。

## 调用流程

1. 根据能力 `name`、`description`、`params_schema` 和 `returns_schema` 选择能力。
2. 把用户提供的信息映射到 `params_schema.properties` 中的字段。
3. 执行 `starry-cli game_operation call_func --code <code> --params '<JSON对象>'`。
4. 根据接口返回的 JSON 回答用户；失败时说明 `code`、`message` 和 `request_id`。

## 请求体映射

CLI 会把命令参数组装成如下请求体：

```json
{
  "code": "ffe_fe",
  "params": {
    "test": "32",
    "page_option": {
      "page": 1,
      "limit": 20
    }
  }
}
```

- `--code` 写入请求体顶层 `code`。
- `--params` 只填写请求体里的 `params` 对象，不要再包一层 `code` 或 `params`。
- 例如 `--params '{"test":"32"}'` 会生成 `"params":{"test":"32"}`。
- `return_type=2` 的列表能力使用 `--page 1 --limit 20`，CLI 会自动写入 `params.page_option`。

## 已知能力 JSON 规范

「已知能力」中的每个能力以 JSON 代码块描述：

```json
{
  "code": "ability_code",
  "name": "能力名称",
  "description": "能力说明",
  "return_type": {"code": 2, "name": "多条数据"},
  "params_schema": {
    "type": "object",
    "properties": {
      "field_code": {
        "type": "string",
        "title": "字段名",
        "description": "字段说明"
      }
    },
    "required": []
  },
  "returns_schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {}
    }
  }
}
```

`params_schema` 用于构造 `--params`。`returns_schema` 用于理解响应字段，不代表 CLI 会过滤响应。

常用 flag：

| flag | 说明 |
|------|------|
| `--code` | 能力 code（必填） |
| `--params` | 请求体 params 的 JSON 对象 |
| `--page` | 列表能力分页 page，会写入 `params.page_option` |
| `--limit` | 列表能力分页 limit，默认 20 |
