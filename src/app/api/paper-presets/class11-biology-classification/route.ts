import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSession } from "@/lib/server/teacher-session";
import { class11BiologyClassificationPaper } from "@/lib/server/class11-biology-classification-paper";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!getTeacherSession(request)) return NextResponse.json({ error: "Teacher sign-in required" }, { status: 401 });
  return NextResponse.json({ title: "Class 11 Biology — Biological Classification", subject: "Biology", chapter_name: "Biological Classification", group_slug: "class-11", duration_minutes: 45, passing_marks: 20, questions: class11BiologyClassificationPaper }, { headers: { "Cache-Control": "private, no-store" } });
}
