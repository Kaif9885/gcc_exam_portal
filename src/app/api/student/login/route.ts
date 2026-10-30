import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { createStudentSession, studentSessionCookieName, studentSessionCookieOptions } from "@/lib/server/student-session";

const classes = new Set(["class-8", "class-9", "class-10-boys", "class-10-girls", "class-11", "class-12"]);

export async function POST(request: NextRequest) {
  let body: { fullName?: string; rollNumber?: string; classSlug?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter your name, class and roll number." }, { status: 400 }); }

  const fullName = body.fullName?.trim() ?? "";
  const rollNumber = body.rollNumber?.trim() ?? "";
  const classSlug = body.classSlug ?? "";
  if (fullName.length < 2 || fullName.length > 120 || !rollNumber || rollNumber.length > 32 || !classes.has(classSlug)) {
    return NextResponse.json({ error: "Enter a valid name, class and roll number." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const group = await db.collection("examGroups").findOne({ slug: classSlug });
    if (!group) return NextResponse.json({ error: "The selected class is not configured in Atlas." }, { status: 503 });
    const groupId = String(group.id ?? group._id);
    const roster = await db.collection("studentRoster").findOne({ exam_group_id: groupId, roll_number: rollNumber, authoritative: true });
    if (!roster || String(roster.full_name).trim().toLocaleLowerCase() !== fullName.toLocaleLowerCase()) {
      return NextResponse.json({ error: "Student name, class or roll number was not found." }, { status: 401 });
    }

    const session = createStudentSession({ fullName: String(roster.full_name), rollNumber, classSlug, className: String(group.name), groupId, board: String(roster.board ?? "BSEB") });
    const response = NextResponse.json({ ok: true, student: { fullName: String(roster.full_name), classSlug, className: String(group.name), rollNumber } });
    response.cookies.set(studentSessionCookieName, session.token, studentSessionCookieOptions(session.maxAge));
    return response;
  } catch (error) {
    console.error("MongoDB student sign-in failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not connect to the school database. Check the Atlas cluster and MONGODB_URI." }, { status: 503 });
  }
}
