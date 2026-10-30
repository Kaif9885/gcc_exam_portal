import { NextResponse } from "next/server";
import { class12BiologyReproductionPaper } from "@/lib/server/class12-biology-paper";

export const dynamic = "force-dynamic";

export async function GET() {
  const questions = class12BiologyReproductionPaper.map(question => ({
    body: question.body,
    marks: question.marks,
    options: question.options.map(({ label, body }) => ({ label, body })),
  }));

  return NextResponse.json({ questions }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
