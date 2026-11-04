import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { getAdminSession } from "@/lib/server/admin-session";

type Context = { params: Promise<{ attemptId: string }> };
const messageTypes = new Set(["offer", "answer", "ice"]);
const PRESENCE_TTL_MS = 20_000;
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/i;
let roomIndexPromise: Promise<void> | null = null;

async function ensureRoomIndexes(db: Awaited<ReturnType<typeof getMongoDb>>) {
  if (!roomIndexPromise) {
    roomIndexPromise = Promise.all([
      db.collection("examVideoParticipants").createIndex({ attempt_id: 1, participant_id: 1 }, { unique: true }),
      db.collection("examVideoParticipants").createIndex({ attempt_id: 1, last_seen: 1 }),
      db.collection("examVideoSignals").createIndex({ attempt_id: 1, to_id: 1, _id: 1 }),
      db.collection("examVideoSignals").createIndex({ created_at: 1 }),
    ]).then(() => undefined).catch(error => {
      roomIndexPromise = null;
      throw error;
    });
  }
  await roomIndexPromise;
}

async function resolveViewer(request: NextRequest, attemptId: string) {
  const db = await getMongoDb();
  const attempt = await db.collection("examAttempts").findOne({ _id: attemptId, status: "in_progress", expires_at: { $gt: new Date() } });
  if (!attempt) return null;

  const studentSession = getStudentSession(request);
  if (studentSession) {
    const student = await db.collection("students").findOne({ exam_group_id: studentSession.groupId, roll_number: studentSession.rollNumber });
    if (student && String(student.id ?? student._id) === String(attempt.student_id)) {
      return { db, attempt, role: "candidate" as const, participantBaseId: `candidate:${attemptId}`, displayName: studentSession.fullName };
    }
  }
  const teacher = getTeacherSession(request);
  if (teacher) return { db, attempt, role: "teacher" as const, participantBaseId: `teacher:${encodeURIComponent(teacher.name.toLowerCase())}`, displayName: teacher.name };
  const admin = getAdminSession(request);
  if (admin) return { db, attempt, role: "teacher" as const, participantBaseId: `admin:${encodeURIComponent(admin.username.toLowerCase())}`, displayName: admin.name };
  return null;
}

export async function GET(request: NextRequest, context: Context) {
  const { attemptId } = await context.params;
  try {
    const viewer = await resolveViewer(request, attemptId);
    if (!viewer) return NextResponse.json({ error: "Active exam session or authorized viewer required." }, { status: 403 });
    const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
    if (!SESSION_ID_PATTERN.test(sessionId)) return NextResponse.json({ error: "Invalid room session." }, { status: 400 });
    const participantId = `${viewer.participantBaseId}:${sessionId}`;
    await ensureRoomIndexes(viewer.db);
    const now = new Date();
    const cutoff = new Date(now.getTime() - PRESENCE_TTL_MS);
    const participants = viewer.db.collection("examVideoParticipants");
    await participants.updateOne(
      { attempt_id: attemptId, participant_id: participantId },
      { $set: { role: viewer.role, display_name: viewer.displayName, last_seen: now } },
      { upsert: true },
    );
    await participants.deleteMany({ attempt_id: attemptId, last_seen: { $lt: cutoff } });
    const activeParticipants = await participants.find({ attempt_id: attemptId, last_seen: { $gte: cutoff } }).toArray();
    const peers = activeParticipants
      .filter(participant => participant.participant_id !== participantId)
      .map(participant => ({ participantId: String(participant.participant_id), role: participant.role, displayName: participant.display_name }));
    const after = request.nextUrl.searchParams.get("after");
    const query: Record<string, unknown> = { attempt_id: attemptId, to_id: participantId };
    if (after && ObjectId.isValid(after)) query._id = { $gt: new ObjectId(after) };
    const rows = await viewer.db.collection("examVideoSignals").find(query).sort({ _id: 1 }).limit(100).toArray();
    const response: { participantId: string; displayName: string; peers: { participantId: string; role: unknown; displayName: unknown }[]; messages: { id: string; fromId: string; type: unknown; payload: unknown }[]; iceServers?: RTCIceServer[] } = {
      participantId,
      displayName: viewer.displayName,
      peers,
      messages: rows.map(row => ({ id: String(row._id), fromId: String(row.from_id), type: row.type, payload: row.payload })),
    };
    if (request.nextUrl.searchParams.get("includeIceServers") === "1") {
      const turnUrls = (process.env.TURN_URL ?? "").split(",").map(url => url.trim()).filter(Boolean);
      response.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
      if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        response.iceServers.push({ urls: turnUrls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
      }
    }
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
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
    const body = await request.json() as { type?: string; sessionId?: string; targetId?: string; payload?: unknown };
    if (!body.sessionId || !SESSION_ID_PATTERN.test(body.sessionId)) return NextResponse.json({ error: "Invalid room session." }, { status: 400 });
    const participantId = `${viewer.participantBaseId}:${body.sessionId}`;
    await ensureRoomIndexes(viewer.db);
    if (body.type === "leave") {
      await viewer.db.collection("examVideoParticipants").deleteOne({ attempt_id: attemptId, participant_id: participantId });
      return NextResponse.json({ ok: true });
    }
    if (!body.type || !messageTypes.has(body.type) || !body.targetId || body.targetId === participantId || body.payload === undefined || JSON.stringify(body.payload).length > 64_000) {
      return NextResponse.json({ error: "Invalid live-room signal." }, { status: 400 });
    }
    const now = new Date();
    const target = await viewer.db.collection("examVideoParticipants").findOne({
      attempt_id: attemptId,
      participant_id: body.targetId,
      last_seen: { $gte: new Date(now.getTime() - PRESENCE_TTL_MS) },
    });
    if (!target || (viewer.role === "candidate" && target.role !== "teacher")) {
      return NextResponse.json({ error: "Live-room participant is no longer available." }, { status: 404 });
    }
    const signals = viewer.db.collection("examVideoSignals");
    await signals.insertOne({ attempt_id: attemptId, from_id: participantId, to_id: body.targetId, type: body.type, payload: body.payload, created_at: now });
    await signals.deleteMany({ attempt_id: attemptId, created_at: { $lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Exam video signal write failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not send video connection signal." }, { status: 503 });
  }
}
