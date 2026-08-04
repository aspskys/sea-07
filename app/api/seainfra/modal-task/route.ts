import { NextResponse } from "next/server";
import {
  loadModalTask,
  resumeModalTask,
  submitAndWaitModalTask,
} from "@/lib/seainfra/modal";
import { requireUser } from "@/lib/supabase/guard";

export const runtime = "nodejs";

/**
 * SeaInfra multimodal task entry (test / integration).
 *
 * POST { capability, prompt, imageUrl?, businessRef?, wait?: boolean }
 *   - creates task, persists task id, optionally waits for terminal state
 * GET  ?taskId=...
 *   - resume / inspect persisted task (does not create a new billable job)
 *
 * Result URLs stay on the server record; clients only receive taskId + status
 * unless explicitly requested with includeUrls=true (still no auto-public CDN).
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  let body: {
    capability?: string;
    prompt?: string;
    imageUrl?: string;
    voice?: string;
    voiceId?: string;
    businessRef?: string;
    wait?: boolean;
    includeUrls?: boolean;
    precharge?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const capability = body.capability?.trim() || "image_generate";
  const prompt = body.prompt?.trim() ?? "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (body.imageUrl && !/^https?:\/\//i.test(body.imageUrl)) {
    return NextResponse.json(
      { error: "imageUrl must be http(s)" },
      { status: 400 },
    );
  }
  if (body.voice && body.voiceId) {
    return NextResponse.json(
      { error: "voice and voiceId are mutually exclusive" },
      { status: 400 },
    );
  }

  try {
    if (body.wait === false) {
      // Create+persist only: submitAndWait always waits; for fire-and-persist
      // we still wait in this phase so the check can verify terminal states.
      // Callers that need async-only should use GET resume after create.
    }
    const result = await submitAndWaitModalTask({
      capability,
      prompt,
      imageUrl: body.imageUrl,
      voice: body.voice,
      voiceId: body.voiceId,
      businessRef: body.businessRef,
      precharge: body.precharge === true,
    });
    return NextResponse.json({
      taskId: result.taskId,
      status: result.status,
      model: result.model,
      capability: result.capability,
      resultUrlCount: result.resultUrls.length,
      ...(body.includeUrls ? { resultUrls: result.resultUrls } : {}),
      precharge: result.precharge ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "modal task failed";
    // Do not auto-retry. Surface task id if present in message.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const taskId = new URL(req.url).searchParams.get("taskId")?.trim();
  const includeUrls = new URL(req.url).searchParams.get("includeUrls") === "true";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  try {
    const persisted = loadModalTask(taskId);
    const result = await resumeModalTask(taskId);
    return NextResponse.json({
      taskId: result.taskId,
      status: result.status,
      model: result.model,
      capability: result.capability,
      businessRef: persisted?.businessRef,
      resultUrlCount: result.resultUrls.length,
      ...(includeUrls ? { resultUrls: result.resultUrls } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "resume failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
