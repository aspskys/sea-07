import { startSession } from "@infiplot/engine";
import type { SceneStreamEvent, StartRequest } from "@infiplot/types";
import { NextResponse } from "next/server";
import { loadEngineConfig } from "@/lib/config";
import {
  logSafetyVerdict,
  safetyHttpBlock,
  scanUserImage,
  scanUserText,
} from "@/lib/seainfra/contentSafety";
import { requireUser } from "@/lib/supabase/guard";

function formatSSE(event: SceneStreamEvent | { type: string; [k: string]: unknown }): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const runtime = "nodejs";

// Matches /api/vision and /api/parse-style-image — the user's resized 512px
// webp is ~30-80 KB; this caps pathological direct-API payloads (which would
// then ride along in every subsequent /api/scene request body via session).
const MAX_STYLE_REF_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  let body: StartRequest;
  try {
    body = (await req.json()) as StartRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.worldSetting?.trim() || !body.styleGuide?.trim()) {
    return NextResponse.json(
      { error: "worldSetting and styleGuide are required" },
      { status: 400 },
    );
  }
  if (typeof body.styleReferenceImage === "string") {
    if (!body.styleReferenceImage.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "styleReferenceImage must be a data:image/... base64 URL" },
        { status: 400 },
      );
    }
    if (body.styleReferenceImage.length > MAX_STYLE_REF_BYTES) {
      return NextResponse.json(
        { error: `styleReferenceImage exceeds ${MAX_STYLE_REF_BYTES} bytes` },
        { status: 413 },
      );
    }
  }

  // Content safety — user world/style text (and optional style ref image)
  // before any generation. Policy: 高风险拦截, fail-closed on unavailable.
  const textBundle = [body.worldSetting, body.styleGuide]
    .filter((s) => typeof s === "string" && s.trim())
    .join("\n\n");
  const textVerdict = await scanUserText(textBundle);
  logSafetyVerdict(textVerdict);
  const textBlock = safetyHttpBlock(textVerdict);
  if (textBlock) {
    return NextResponse.json(
      { error: textBlock.error, code: textBlock.code },
      { status: textBlock.status },
    );
  }
  if (typeof body.styleReferenceImage === "string") {
    const imageVerdict = await scanUserImage({
      imageBase64: body.styleReferenceImage,
    });
    logSafetyVerdict(imageVerdict);
    const imageBlock = safetyHttpBlock(imageVerdict);
    if (imageBlock) {
      return NextResponse.json(
        { error: imageBlock.error, code: imageBlock.code },
        { status: imageBlock.status },
      );
    }
  }

  const acceptsSSE = req.headers.get("accept")?.includes("text/event-stream");

  try {
    const base = loadEngineConfig();
    const config = body.clientTts === true ? { ...base, tts: undefined } : base;

    if (!acceptsSSE) {
      const result = await startSession(config, body);
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await startSession(config, body, (event) => {
            controller.enqueue(encoder.encode(formatSSE(event)));
          });
          controller.enqueue(
            encoder.encode(
              formatSSE({ type: "done", response: result }),
            ),
          );
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(formatSSE({ type: "error", message })),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
