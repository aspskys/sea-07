# mureka_tts

**Provider:** mureka

API 文档: https://platform.mureka.ai/docs/api/operations/post-v1-tts-generate.html

Mureka TTS 文本转语音接口。调用 Mureka `POST /v1/tts/generate`，请求体按官方 JSON 参数透传，成功后返回音频 URL 和过期时间。

## Model Info

```json
{
  "type": "object",
  "tags": [
    "文生音频",
    "TTS"
  ],
  "input": [
    "text"
  ],
  "output": [
    "audio"
  ]
}
```

## Body Template

```json
{
  "model": "mureka_tts",
  "dash_scope": true,
  "moderation": true,
  "input": [
    {
      "params": {
        "text": "<text>",
        "voice": "Ethan",
        "voice_id": "<voice_id>"
      }
    }
  ],
  "metadata": {}
}
```

> Pass this as `--body-json` to `sac generate submit`. Fill in all `<placeholder>` values.

## Fields

- `text` — string, **required**
  需要生成音频的文本，最大 500 字符。
- `voice` — string, optional — enum: `Ethan` | `Victoria` | `Jake` | `Luna` | `Emma`
  内置音色。选择此项时不能同时传 voice_id。
- `voice_id` — string, optional
  通过 files/upload 的 voice purpose 生成的声音 ID。选择此项时不能同时传 voice。
