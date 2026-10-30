import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { class10BiologyControlCoordinationPaper } from "@/lib/server/class10-biology-control-coordination-paper";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!getTeacherSession(request)) return NextResponse.json({ error: "Teacher sign-in required" }, { status: 401 });
  return NextResponse.json({ title: "Class 10 Biology — Control and Coordination", subject: "Biology", chapter_name: "Control and Coordination", group_slug: "class-10-boys", share_class10: true, duration_minutes: 45, passing_marks: 20, questions: class10BiologyControlCoordinationPaper }, { headers: { "Cache-Control": "private, no-store" } });
}
