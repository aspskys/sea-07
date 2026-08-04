# alibaba_qianwen_image

**Provider:** alibaba



## Body Template

```json
{
  "model": "alibaba_qianwen_image",
  "dash_scope": true,
  "moderation": true,
  "input": [
    {
      "params": {
        "input": {
          "messages": [
            {
              "role": "user",
              "content": [
                {
                  "text": "<text>"
                }
              ]
            }
          ]
        },
        "parameters": {
          "negative_prompt": "<negative_prompt>",
          "size": "1664*928",
          "n": "<n>",
          "seed": "<seed>",
          "prompt_extend": "<prompt_extend>",
          "watermark": "<watermark>"
        }
      }
    }
  ],
  "metadata": {}
}
```

> Pass this as `--body-json` to `sac generate submit`. Fill in all `<placeholder>` values.

## Fields

- `input` — object, optional
  输入参数
  - `messages` — array<object>, **required**
    消息列表，必须包含一个消息对象，参数不能为空
    - `role` — string, **required** — enum: `user`
      角色，必须为 'user'，参数不能为空
    - `content` — array<object>, **required**
      内容列表，必须包含一个文本内容对象，参数不能为空
      - `text` — string, **required**
        文本提示词，描述要生成的图像内容，长度不超过800字符，参数不能为空
- `parameters` — object, optional
  可选参数
  - `negative_prompt` — string, optional
    负面提示词，描述不要生成的图像内容，长度不超过500字符
  - `size` — string, optional — enum: `1664*928` | `1472*1140` | `1328*1328` | `1140*1472` | `928*1664`
    图像尺寸
  - `n` — integer, optional (min: 1, max: 1)
    生成图像数量，目前只支持生成一张图片
  - `seed` — integer, optional (min: 0, max: 2147483647)
    随机种子，用于可重现的生成结果
  - `prompt_extend` — boolean, optional
    是否启用提示词增强
  - `watermark` — boolean, optional
    是否添加水印

## Constraints

- `role`: fixed_value `user`
- `size`: enum [1664*928, 1472*1140, 1328*1328, 1140*1472, 928*1664], default `1328*1328`
- `n`: fixed_value `1`, default `1`
- `seed`: range [0, 2147483647]
- `prompt_extend`: default `true`
- `watermark`: default `false`
