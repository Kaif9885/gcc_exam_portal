import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { class12BiologyReproductionPaper } from "@/lib/server/class12-biology-paper";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!getTeacherSession(request)) return NextResponse.json({ error: "Teacher sign-in required" }, { status: 401 });
  return NextResponse.json({ title: "Class 12 Biology — Sexual Reproduction in Flowering Plants", subject: "Biology", chapter_name: "Sexual Reproduction in Flowering Plants", group_slug: "class-12", duration_minutes: 45, passing_marks: 20, questions: class12BiologyReproductionPaper }, { headers: { "Cache-Control": "private, no-store" } });
}
