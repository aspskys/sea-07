# alibaba_qwen_image_2_0

**Provider:** alibaba

Alibaba Qwen Image 2.0 Generator Implementation

Model: qwen-image-2.0 (固定模型)
Features: 图像编辑功能，加速版本，兼顾效果与响应速度
Capabilities: 精确修改图内文字、增删或移动物体、改变主体动作、迁移图片风格、增强画面细节
Image Count: 支持生成 1-6 张图片
Input Images: 支持 1-3 张输入图片
Size: 图像总像素需在 512\_512 至 2048\_2048 之间，默认与输入图（多图输入时为最后一张）一致
Format: 输出格式为 PNG
Advanced: 支持负面提示词、提示词增强、水印设置、随机种子控制

API Documentation: https://help.aliyun.com/zh/model-studio/qwen-image-edit-api

## Body Template

```json
{
  "model": "alibaba_qwen_image_2_0",
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
                },
                {
                  "image": "<image>"
                }
              ]
            }
          ]
        },
        "parameters": {
          "n": "<n>",
          "negative_prompt": "<negative_prompt>",
          "size": "<size>",
          "prompt_extend": "<prompt_extend>",
          "watermark": "<watermark>",
          "seed": "<seed>"
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
  输入参数对象
  - `messages` — array<object>, **required**
    请求内容数组。当前仅支持单轮对话，因此数组内有且只有一个对象，参数不能为空
    - `role` — string, **required** — enum: `user`
      消息发送者角色，必须设置为 user，参数不能为空
    - `content` — array<object>, **required**
      消息内容，可包含 1-3 张图像或文本指令，参数不能为空，同一个 content 对象中不能同时包含 text 和 image 字段，两者只能选择其一。
      Each item can be one of:
      - `text` — string, **required**
        参数不能为空
      - `image` — string, **required**
- `parameters` — object, optional
  控制图像生成的附加参数
  - `n` — integer, optional (min: 1, max: 6)
    输出图像的数量，默认值为 1，可选择输出 1-6 张图片
  - `negative_prompt` — string, optional
    反向提示词，用来描述不希望在画面中看到的内容。长度上限 500 个字符
  - `size` — string, optional
    输出图像的分辨率，格式为 宽*高，例如 '1024*1536'。
图像总像素需在 512*512 至 2048*2048 之间。
默认分辨率与输入图（多图输入时为最后一张）一致。
常见比例推荐：
- 1:1: 1024*1024、1536*1536
- 2:3: 768*1152、1024*1536
- 3:2: 1152*768、1536*1024
- 3:4: 960*1280、1080*1440
- 4:3: 1280*960、1440*1080
- 9:16: 720*1280、1080*1920
- 16:9: 1280*720、1920*1080
- 21:9: 1344*576、2048*872
  - `prompt_extend` — boolean, optional
    是否开启提示词智能改写，默认值为 true。开启后，模型会优化正向提示词，对描述较简单的提示词效果提升明显
  - `watermark` — boolean, optional
    是否在图像右下角添加 'Qwen-Image' 水印，默认值为 false
  - `seed` — integer, optional (min: 0, max: 2147483647)
    随机数种子，取值范围 [0, 2147483647]。使用相同的 seed 参数值可使生成内容保持相对稳定

## Constraints

- `role`: fixed_value `user`
- `n`: range [1, 6], default `1`
- `prompt_extend`: default `true`
- `watermark`: default `false`
- `seed`: range [0, 2147483647]
