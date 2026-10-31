"use client";

import { useState } from "react";
import { Download } from "lucide-react";

type Option = { label: string; body: string; is_correct: boolean };
type Question = { position: number; body: string; marks: number; image_url?: string | null; options: Option[] };

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, char => entities[char] ?? char);
}

function formatMathHtml(value: unknown) {
  return String(value ?? "").split(/(\$[^$]+\$)/g).map(segment => {
    if (!segment.startsWith("$") || !segment.endsWith("$")) return escapeHtml(segment).replaceAll("$", "");
    const expression = escapeHtml(segment.slice(1, -1)).replace(/\\text\{([^{}]*)\}/g, "$1");
    const formatted = expression
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-frac"><span>$1</span><span>$2</span></span>')
      .replaceAll("\\times", "×")
      .replaceAll("\\pi", "π")
      .replaceAll("\\le", "≤")
      .replaceAll("\\ge", "≥")
      .replace(/\^2\b/g, "<sup>2</sup>")
      .replace(/\^3\b/g, "<sup>3</sup>");
    return `<span class="math-inline">${formatted}</span>`;
  }).join("");
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

      const titleText = title.toLocaleLowerCase();
      const metadata = [className, subject, chapter]
        .filter(value => value && !titleText.includes(value.toLocaleLowerCase()));
      const logoUrl = "https://gcc-result-out.onrender.com/static/logo.jpeg";

      const questionHtml = questions.map((q, index) => `
        <article>
          <div class="question">
            <b>Q${index + 1}. ${formatMathHtml(q.body)}</b>
            <span>${escapeHtml(q.marks)} mark${q.marks === 1 ? "" : "s"}</span>
          </div>
          ${q.image_url ? `<img class="question-image" src="${escapeHtml(q.image_url)}" alt="Question illustration">` : ""}
          <ol>${q.options.map(opt => `
            <li class="${opt.is_correct ? "correct" : ""}">
              ${opt.is_correct ? '<strong class="tick">✓</strong> ' : ""}
              <b>${escapeHtml(opt.label)}.</b> ${formatMathHtml(opt.body)}
            </li>`).join("")}
          </ol>
        </article>`).join("");

      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — Questions</title><style>
        body{font-family:Arial,sans-serif;color:#17243a;max-width:900px;margin:32px auto;padding:0 24px}
        .paper-sheet{border:1px solid #cbd7e8;border-radius:14px;padding:26px 30px;background:#fff;box-shadow:0 8px 24px #17243a12}
        header{text-align:center;border-bottom:2px solid #d8e1ee;padding-bottom:18px;margin-bottom:8px}
        .school-brand{position:relative;display:flex;align-items:center;justify-content:center;min-height:88px;margin-bottom:14px}
        .school-logo{position:absolute;left:0;top:50%;transform:translateY(-50%);width:88px;height:88px;object-fit:contain}
        h1{width:100%;font-size:30px;letter-spacing:.4px;margin:0;color:#17243a;text-align:center;padding:0 100px}.paper-title{margin:7px 0 0;color:#53627a;font-size:17px;font-weight:600;text-align:center}
        article{padding:16px 0;border-bottom:1px solid #e2e8f1;break-inside:avoid}
        .question{display:flex;justify-content:space-between;gap:12px}
        .question span{white-space:nowrap;color:#687891;font-size:12px}
        .question-image{display:block;max-width:100%;max-height:280px;object-fit:contain;margin:12px 0}
        ol{padding-left:25px;margin:10px 0 0;display:grid;gap:6px}
        li{padding:6px 8px;border-radius:5px;color:#394a63}
        .correct{background:#e8f7ee;color:#17633c;font-weight:700}
        .tick{color:#17633c;font-size:17px;margin-right:5px}
        .math-inline{white-space:nowrap;font-family:Cambria,"Times New Roman",serif}.math-frac{display:inline-flex;flex-direction:column;vertical-align:middle;align-items:center;margin:0 .1em;line-height:1.05;font-size:.86em;white-space:nowrap}.math-frac>span:first-child{padding:0 .1em .05em;border-bottom:1px solid currentColor}.math-frac>span:last-child{padding:.04em .1em 0}
        @media(max-width:600px){body{padding:0 10px}.paper-sheet{padding:18px 15px}.school-brand{min-height:64px}.school-logo{width:58px;height:58px}h1{font-size:19px;padding:0 62px}.paper-title{font-size:15px}}
        @media print{body{max-width:none;margin:0;padding:0}.paper-sheet{border:1px solid #b8c6d9;border-radius:0;padding:18px 22px;box-shadow:none}header{break-after:avoid}}
      </style></head><body>
        <main class="paper-sheet"><header><div class="school-brand"><img class="school-logo" src="${escapeHtml(logoUrl)}" alt="Glorious Coaching Centre logo"><h1>GLORIOUS COACHING CENTRE</h1></div><p class="paper-title">${escapeHtml(title)}</p>${metadata.length ? `<p class="paper-title">${metadata.map(escapeHtml).join(" · ")}</p>` : ""}</header>
        ${questionHtml}</main>
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
