"use client";

import { useState } from "react";
import { Download } from "lucide-react";

type Option = { label: string; body: string; is_correct: boolean };
type Question = { position: number; body: string; marks: number; image_url?: string | null; options: Option[] };

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, char => entities[char] ?? char);
}

export function TeacherAnswerKeyDownload({
  examId, title, subject, chapter, className,
}: {
  examId: string; title: string; subject: string; chapter: string; className: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setError("Allow pop-ups to create the answer-key PDF."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/teacher/questions?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
      const json = await res.json() as { questions?: Question[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load the question paper.");
      const questions = Array.isArray(json.questions) ? json.questions : [];
      if (!questions.length) throw new Error("No questions are available for this exam.");

      const questionHtml = questions.map((q, index) => `
        <article>
          <div class="question">
            <b>Q${index + 1}. ${escapeHtml(q.body)}</b>
            <span>${escapeHtml(q.marks)} mark${q.marks === 1 ? "" : "s"}</span>
          </div>
          ${q.image_url ? `<img class="question-image" src="${escapeHtml(q.image_url)}" alt="Question illustration">` : ""}
          <ol>${q.options.map(opt => `
            <li class="${opt.is_correct ? "correct" : ""}">
              ${opt.is_correct ? '<strong class="tick">✓</strong> ' : ""}
              <b>${escapeHtml(opt.label)}.</b> ${escapeHtml(opt.body)}
            </li>`).join("")}
          </ol>
        </article>`).join("");

      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — Questions</title><style>
        body{font-family:Arial,sans-serif;color:#17243a;max-width:850px;margin:32px auto;padding:0 24px}
        header{text-align:center;border-bottom:2px solid #17243a;padding-bottom:14px;margin-bottom:20px}
        h1{font-size:22px;margin:0 0 8px}header p{margin:4px;color:#53627a}
        article{padding:14px 0;border-bottom:1px solid #d9e0ea;break-inside:avoid}
        .question{display:flex;justify-content:space-between;gap:12px}
        .question span{white-space:nowrap;color:#687891;font-size:12px}
        .question-image{display:block;max-width:100%;max-height:280px;object-fit:contain;margin:12px 0}
        ol{padding-left:25px;margin:10px 0 0;display:grid;gap:6px}
        li{padding:6px 8px;border-radius:5px;color:#394a63}
        .correct{background:#e8f7ee;color:#17633c;font-weight:700}
        .tick{color:#17633c;font-size:17px;margin-right:5px}
        @media print{body{margin:0 auto;padding:0 12px}header{break-after:avoid}}
      </style></head><body>
        <header><h1>GLORIOUS COACHING CENTRE</h1><p>${escapeHtml(title)}</p><p>${escapeHtml(className)} · ${escapeHtml(subject)} · ${escapeHtml(chapter)}</p></header>
        ${questionHtml}
        <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script>
      </body></html>`);
      printWindow.document.close();
    } catch (cause) {
      printWindow.close();
      setError(cause instanceof Error ? cause.message : "Could not create the answer-key PDF.");
    } finally { setBusy(false); }
  }

  return (
    <div className="answer-key-download">
      <button type="button" className="button button-secondary" onClick={() => void download()} disabled={busy}>
        <Download size={14} />
        {busy ? "Preparing answer key…" : "Download questions & answers PDF"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
