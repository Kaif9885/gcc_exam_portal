import { NextResponse, type NextRequest } from "next/server";
import { getDemoPaper } from "@/lib/server/demo-paper-catalog";

export async function POST(request: NextRequest, context: { params: Promise<{ paper: string }> }) {
  const { paper: slug } = await context.params;
  const paper = getDemoPaper(slug);
  if (!paper) return NextResponse.json({ error: "Demo paper not found for the selected class." }, { status: 404 });

  const cookieName = `ghs_demo_submissions_${slug.replaceAll("-", "_")}`;
  const submissions = Number(request.cookies.get(cookieName)?.value || "0");
  if (submissions >= 2) return NextResponse.json({ error: "Demo submission limit reached on this browser." }, { status: 429 });

  let body: { answers?: { question_index: number; option_label: string }[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid demo answers." }, { status: 400 }); }
  if (!Array.isArray(body.answers) || body.answers.length > paper.questions.length) return NextResponse.json({ error: "Invalid demo answers." }, { status: 400 });

  const selected = new Map<number, string>();
  for (const answer of body.answers) {
    if (!Number.isInteger(answer.question_index) || answer.question_index < 0 || answer.question_index >= paper.questions.length || typeof answer.option_label !== "string") {
      return NextResponse.json({ error: "An answer is invalid." }, { status: 400 });
    }
    const question = paper.questions[answer.question_index];
    if (!question.options.some(option => option.label === answer.option_label)) return NextResponse.json({ error: "An option does not belong to this question." }, { status: 400 });
    selected.set(answer.question_index, answer.option_label);
  }

  const questions = paper.questions.map((question, questionIndex) => {
    const selectedOption = selected.get(questionIndex) ?? null;
    const correctOption = question.options.find(option => option.is_correct);
    return { body: question.body, marks: question.marks, selected_option: selectedOption, correct_option: correctOption?.label ?? null, options: question.options.map(({ label, body: optionBody }) => ({ label, body: optionBody })) };
  });
  const marksObtained = paper.questions.reduce((total, question, questionIndex) => total + (question.options.find(option => option.label === selected.get(questionIndex))?.is_correct ? question.marks : 0), 0);
  const maxMarks = paper.questions.reduce((total, question) => total + question.marks, 0);
  const response = NextResponse.json({ marks_obtained: marksObtained, max_marks: maxMarks, percentage: maxMarks ? marksObtained / maxMarks * 100 : 0, answered_count: selected.size, questions });
  response.cookies.set(cookieName, String(submissions + 1), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
