import { createHash } from "node:crypto";
import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { getAdminSession } from "@/lib/server/admin-session";

type Context = { params: Promise<{ attemptId: string }> };
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest, context: Context) {
  const { attemptId } = await context.params;
  const liveKitUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!liveKitUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET on the server." }, { status: 503 });
  }

  let body: { sessionId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid room join request." }, { status: 400 }); }
  if (!body.sessionId || !SESSION_ID_PATTERN.test(body.sessionId)) {
    return NextResponse.json({ error: "Invalid live-room session." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const attempt = await db.collection("examAttempts").findOne({
      _id: attemptId,
      status: "in_progress",
      expires_at: { $gt: new Date() },
    });
    if (!attempt) return NextResponse.json({ error: "This exam attempt is no longer active." }, { status: 403 });

    let role: "candidate" | "teacher";
    if (getTeacherSession(request) || getAdminSession(request)) {
      role = "teacher";
    } else {
      const studentSession = getStudentSession(request);
      if (!studentSession) return NextResponse.json({ error: "Authorized student or teacher session required." }, { status: 401 });
      const student = await db.collection("students").findOne({ exam_group_id: studentSession.groupId, roll_number: studentSession.rollNumber });
      if (!student || String(student.id ?? student._id) !== String(attempt.student_id)) {
        return NextResponse.json({ error: "This exam attempt does not belong to this student." }, { status: 403 });
      }
      role = "candidate";
    }

    const roomName = `exam-${createHash("sha256").update(String(attempt._id)).digest("hex").slice(0, 40)}`;
    const identity = `${role}-${body.sessionId}`;
    const grant: VideoGrant = {
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishSources: role === "candidate"
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
        : [TrackSource.MICROPHONE],
      canPublishData: false,
    };
    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity,
      name: role === "candidate" ? "Student" : "Teacher",
      metadata: JSON.stringify({ role }),
      ttl: "2h",
    });
    accessToken.addGrant(grant);
    const token = await accessToken.toJwt();

    return NextResponse.json({ url: liveKitUrl, token, identity, role }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("LiveKit token issue failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not authorize the live exam connection." }, { status: 503 });
  }
}
