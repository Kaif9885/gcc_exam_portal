import { NextRequest, NextResponse } from "next/server";
import { class12BiologyReproductionPaper } from "@/lib/server/class12-biology-paper";

export const dynamic = "force-dynamic";

type SubmittedAnswer = { question_index: number; option_label: string };

export async function POST(request: NextRequest) {
  const submissions = Number(request.cookies.get("ghs_demo_paper_submissions")?.value || "0");
  if (submissions >= 2) {
    return NextResponse.json({ error: "Demo submission limit reached: marksheet submission is allowed twice in this browser." }, { status: 403 });
  }

  let payload: { answers?: SubmittedAnswer[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid answer submission." }, { status: 400 });
  }

  const answers = payload.answers;
  if (!Array.isArray(answers) || answers.length > class12BiologyReproductionPaper.length) {
    return NextResponse.json({ error: "Invalid answer list." }, { status: 400 });
  }

  const selected = new Map<number, string>();
  for (const answer of answers) {
    if (!Number.isInteger(answer.question_index) || answer.question_index < 0 || answer.question_index >= class12BiologyReproductionPaper.length) {
      return NextResponse.json({ error: "An answer refers to an invalid question." }, { status: 400 });
    }
    const question = class12BiologyReproductionPaper[answer.question_index];
    if (!question.options.some(option => option.label === answer.option_label) || selected.has(answer.question_index)) {
      return NextResponse.json({ error: "An answer choice is invalid or duplicated." }, { status: 400 });
    }
    selected.set(answer.question_index, answer.option_label);
  }

  let marksObtained = 0;
  let maxMarks = 0;
  let answeredCount = 0;
  const questions = class12BiologyReproductionPaper.map((question, questionIndex) => {
    const selectedOption = selected.get(questionIndex) ?? null;
    maxMarks += question.marks;
    if (selectedOption) {
      answeredCount++;
      if (question.options.some(option => option.label === selectedOption && option.is_correct)) marksObtained += question.marks;
    }
    return {
      body: question.body,
      marks: question.marks,
      selected_option: selectedOption,
      options: question.options.map(({ label, body }) => ({ label, body })),
    };
  });

  const response = NextResponse.json({
    marks_obtained: marksObtained,
    max_marks: maxMarks,
    percentage: maxMarks ? (marksObtained / maxMarks) * 100 : 0,
    answered_count: answeredCount,
    questions,
  }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set("ghs_demo_paper_submissions", String(submissions + 1), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
