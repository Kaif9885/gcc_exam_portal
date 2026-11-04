import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { getAdminSession } from "@/lib/server/admin-session";

type Context = { params: Promise<{ attemptId: string }> };
const messageTypes = new Set(["offer", "answer", "ice", "close"]);

async function resolveViewer(request: NextRequest, attemptId: string) {
  const db = await getMongoDb();
  const attempt = await db.collection("examAttempts").findOne({ _id: attemptId, status: "in_progress", expires_at: { $gt: new Date() } });
  if (!attempt) return null;

  const studentSession = getStudentSession(request);
  if (studentSession) {
    const student = await db.collection("students").findOne({ exam_group_id: studentSession.groupId, roll_number: studentSession.rollNumber });
    if (student && String(student.id ?? student._id) === String(attempt.student_id)) {
      return { db, attempt, role: "candidate" as const };
    }
  }
  if (getTeacherSession(request) || getAdminSession(request)) return { db, attempt, role: "teacher" as const };
  return null;
}

export async function GET(request: NextRequest, context: Context) {
  const { attemptId } = await context.params;
  try {
    const viewer = await resolveViewer(request, attemptId);
    if (!viewer) return NextResponse.json({ error: "Active exam session or authorized viewer required." }, { status: 403 });
    let callId = request.nextUrl.searchParams.get("callId")?.trim() ?? "";
    if (viewer.role === "candidate") {
      const latestOffer = await viewer.db.collection("examVideoSignals").findOne(
        { attempt_id: attemptId, sender: "teacher", type: "offer" }, { sort: { _id: -1 } },
      );
      if (latestOffer?.call_id) callId = String(latestOffer.call_id);
    }
    const after = request.nextUrl.searchParams.get("after");
    const query: Record<string, unknown> = { attempt_id: attemptId, sender: { $ne: viewer.role } };
    if (callId) query.call_id = callId;
    if (after && ObjectId.isValid(after)) query._id = { $gt: new ObjectId(after) };
    const rows = await viewer.db.collection("examVideoSignals").find(query).sort({ _id: 1 }).limit(50).toArray();
    return NextResponse.json({ callId, messages: rows.map(row => ({ id: String(row._id), callId: String(row.call_id ?? ""), type: row.type, payload: row.payload })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Exam video signal read failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not read video connection signals." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { attemptId } = await context.params;
  try {
    const viewer = await resolveViewer(request, attemptId);
    if (!viewer) return NextResponse.json({ error: "Active exam session or authorized viewer required." }, { status: 403 });
    const body = await request.json() as { type?: string; callId?: string; payload?: unknown };
    if (!body.type || !messageTypes.has(body.type) || !body.callId || !/^[A-Za-z0-9_-]{12,80}$/.test(body.callId)) return NextResponse.json({ error: "Invalid video connection signal." }, { status: 400 });
    const payload = body.type === "close" ? null : body.payload;
    if (payload === undefined || JSON.stringify(payload).length > 64_000) return NextResponse.json({ error: "Invalid video connection data." }, { status: 400 });
    const now = new Date();
    const signals = viewer.db.collection("examVideoSignals");
    await Promise.all([
      signals.insertOne({ attempt_id: attemptId, call_id: body.callId, sender: viewer.role, type: body.type, payload, created_at: now }),
      signals.deleteMany({ created_at: { $lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Exam video signal write failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not send video connection signal." }, { status: 503 });
  }
}
