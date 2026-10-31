"use client";

import { useState } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { MathText } from "@/components/MathText";

type Option = { label: string; body: string; is_correct: boolean };
type Question = { id: string; position: number; body: string; marks: number; image_url: string | null; options: Option[] };

export function TeacherPaperQuestions({ examId }: { examId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (questions.length) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/teacher/questions?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
      const json = await res.json() as { questions?: Question[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load the authorized question paper.");
      setQuestions(Array.isArray(json.questions) ? json.questions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the authorized question paper.");
    } finally { setLoading(false); }
  }

  return (
    <div className="teacher-paper-preview">
      <button type="button" className="paper-preview-toggle" onClick={() => void toggle()}>
        {open ? <EyeOff size={13} /> : <Eye size={13} />}
        {open ? "Hide questions" : "Preview questions"}
        <BookOpen size={13} />
      </button>
      {open && (
        <div className="paper-question-list">
          {loading ? (
            <span>Loading questions…</span>
          ) : error ? (
            <span className="preview-error">{error}</span>
          ) : questions.length === 0 ? (
            <span className="preview-error">No questions found for this exam.</span>
          ) : (
            questions.map((q, index) => (
              <article key={q.id}>
                <b>Q{index + 1}. <MathText text={q.body}/></b>
                <small>{q.marks} mark{q.marks === 1 ? "" : "s"}</small>
                <ol>
                  {q.options.map(opt => (
                    <li key={opt.label} className={opt.is_correct ? "answer-key" : ""}>
                      <strong>{opt.label}.</strong> <MathText text={opt.body}/>
                      {opt.is_correct && <em> Answer</em>}
                    </li>
                  ))}
                </ol>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
