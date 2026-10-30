import { NextResponse, type NextRequest } from "next/server";
import { getDemoPaper } from "@/lib/server/demo-paper-catalog";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ paper: string }> }) {
  const { paper: slug } = await context.params;
  const paper = getDemoPaper(slug);
  if (!paper) return NextResponse.json({ error: "Demo paper not found for the selected class." }, { status: 404 });
  return NextResponse.json({
    title: paper.title,
    subject: paper.subject,
    chapter_name: paper.chapter,
    questions: paper.questions.map(question => ({ body: question.body, marks: question.marks, options: question.options.map(({ label, body }) => ({ label, body })) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
