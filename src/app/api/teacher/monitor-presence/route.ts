import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getTeacherSession } from "@/lib/server/teacher-session";

function getViewerId(request: NextRequest) {
  const bodyId = request.headers.get("x-monitor-viewer-id")?.trim() ?? "";
  return /^[A-Za-z0-9_-]{12,80}$/.test(bodyId) ? bodyId : null;
}

async function getActiveViewers(db: Awaited<ReturnType<typeof getMongoDb>>, cutoff: Date) {
  const rows = await db.collection("teacherMonitorPresence")
    .find({ last_seen_at: { $gte: cutoff } })
    .sort({ teacher_name: 1 })
    .toArray();
  const byTeacher = new Map<string, { name: string; lastSeenAt: string }>();
  for (const row of rows) {
    const name = String(row.teacher_name ?? "Teacher");
    if (!byTeacher.has(name)) byTeacher.set(name, { name, lastSeenAt: new Date(row.last_seen_at).toISOString() });
  }
  return [...byTeacher.values()];
}

export async function POST(request: NextRequest) {
  const teacher = getTeacherSession(request);
  if (!teacher) return NextResponse.json({ error: "Teacher session required." }, { status: 401 });
  const viewerId = getViewerId(request);
  if (!viewerId) return NextResponse.json({ error: "Monitor session ID is required." }, { status: 400 });
  try {
    const db = await getMongoDb();
    const now = new Date();
    const cutoff = new Date(now.getTime() - 40_000);
    const presenceId = `${teacher.name}:${viewerId}`;
    await Promise.all([
      db.collection("teacherMonitorPresence").deleteMany({ last_seen_at: { $lt: cutoff } }),
      db.collection("teacherMonitorPresence").updateOne(
        { _id: presenceId },
        { $set: { teacher_name: teacher.name, last_seen_at: now } },
        { upsert: true },
      ),
    ]);
    const viewers = await getActiveViewers(db, cutoff);
    return NextResponse.json({ viewers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Teacher monitor presence update failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not update monitor viewer status." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const teacher = getTeacherSession(request);
  if (!teacher) return NextResponse.json({ error: "Teacher session required." }, { status: 401 });
  const viewerId = getViewerId(request);
  if (!viewerId) return NextResponse.json({ error: "Monitor session ID is required." }, { status: 400 });
  try {
    const db = await getMongoDb();
    await db.collection("teacherMonitorPresence").deleteOne({ _id: `${teacher.name}:${viewerId}` });
    const cutoff = new Date(Date.now() - 40_000);
    return NextResponse.json({ viewers: await getActiveViewers(db, cutoff) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Teacher monitor presence removal failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not update monitor viewer status." }, { status: 503 });
  }
}
