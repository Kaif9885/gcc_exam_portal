"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";

const groups = [
  { name: "Class 8", slug: "class-8" }, { name: "Class 9", slug: "class-9" },
  { name: "Class 10 Boys", slug: "class-10-boys" }, { name: "Class 10 Girls", slug: "class-10-girls" },
  { name: "Class 11", slug: "class-11" }, { name: "Class 12", slug: "class-12" },
];
type OptionDraft = { label: string; body: string; is_correct: boolean };
type QuestionDraft = { body: string; marks: number; options: OptionDraft[] };
export type ExistingExam = {
  id: string;
  title: string;
  subject: string;
  chapterName: string;
  academicSession: string;
  durationSeconds: number;
  passingMarks: number;
  published: boolean;
  startsAt: string | null;
  groups: { slug: string; name: string }[];
};
type LoadedQuestion = { body: string; marks: number; options: OptionDraft[] };
const newQuestion = (): QuestionDraft => ({ body: "", marks: 1, options: ["A", "B", "C", "D"].map((label, index) => ({ label, body: "", is_correct: index === 0 })) });

function toDatetimeLocalIST(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function getExamEndPreview(startsAt: string) {
  if (!startsAt) return "";
  const date = new Date(`${startsAt}:00+05:30`);
  if (Number.isNaN(date.getTime())) return "";
  date.setTime(date.getTime() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function PaperBuilder({
  onCreated,
  initialGroupSlug,
  initialSubject,
  initialChapter,
  initialExam,
}: {
  onCreated: () => void;
  initialGroupSlug?: string;
  initialSubject?: string;
  initialChapter?: string;
  initialExam?: ExistingExam;
}) {
  const [title, setTitle] = useState(initialExam?.title ?? "");
  const [subject, setSubject] = useState(initialExam?.subject ?? initialSubject ?? "Biology");
  const [chapter, setChapter] = useState(initialExam?.chapterName ?? initialChapter ?? "");
  const [session, setSession] = useState(initialExam?.academicSession ?? "2026-27");
  const [group, setGroup] = useState(
    initialExam?.groups.find(item => item.slug === "class-10-boys")?.slug ??
    initialExam?.groups[0]?.slug ??
    initialGroupSlug ??
    "class-8",
  );
  const [shareClass10, setShareClass10] = useState(Boolean(initialExam && initialExam.groups.length > 1));
  const [duration, setDuration] = useState(initialExam ? Math.round(initialExam.durationSeconds / 60) : 60);
  const [startsAt, setStartsAt] = useState(toDatetimeLocalIST(initialExam?.startsAt ?? null));
  const [passingMarks, setPassingMarks] = useState(initialExam?.passingMarks ?? 0);
  const [publish, setPublish] = useState(initialExam?.published ?? false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const [questionsVisible, setQuestionsVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [questionsLoaded, setQuestionsLoaded] = useState(!initialExam);
  const [message, setMessage] = useState("");
  const maxMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const isClass10 = group === "class-10-boys" || group === "class-10-girls";

  useEffect(() => {
    if (!initialExam) return;
    const examId = initialExam.id;
    let active = true;
    setQuestionsLoaded(false);
    async function loadExamQuestions() {
      setBusy(true);
      setMessage("");
      try {
        const response = await fetch(`/api/teacher/questions?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
        const json = await response.json() as { questions?: LoadedQuestion[]; error?: string };
        if (!response.ok) throw new Error(json.error ?? "Could not load this exam's questions.");
        if (!active) return;
        const loaded = (json.questions ?? []).map(question => ({
          body: question.body,
          marks: question.marks,
          options: question.options.map(option => ({ ...option })),
        }));
        setQuestions(loaded.length ? loaded : [newQuestion()]);
        setQuestionsVisible(false);
        setQuestionsLoaded(true);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Could not load this exam's questions.");
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadExamQuestions();
    return () => { active = false; };
  }, [initialExam]);

  function updateQuestion(index: number, update: Partial<QuestionDraft>) {
    setQuestions(current => current.map((question, i) => i === index ? { ...question, ...update } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, body: string) {
    setQuestions(current => current.map((question, i) => i === questionIndex
      ? { ...question, options: question.options.map((option, j) => j === optionIndex ? { ...option, body } : option) }
      : question));
  }

  function setCorrect(questionIndex: number, optionIndex: number) {
    setQuestions(current => current.map((question, i) => i === questionIndex
      ? { ...question, options: question.options.map((option, j) => ({ ...option, is_correct: j === optionIndex })) }
      : question));
  }

  function removeQuestion(index: number) {
    setQuestions(current => current.filter((_, questionIndex) => questionIndex !== index));
  }

  async function saveExam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionsLoaded) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(initialExam ? `/api/teacher/papers/${encodeURIComponent(initialExam.id)}` : "/api/teacher/papers", {
        method: initialExam ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subject,
          chapter_name: chapter.trim(),
          academic_session: session.trim(),
          group_slug: group,
          share_class10: shareClass10 && isClass10,
          duration_minutes: Number(duration),
          passing_marks: Number(passingMarks),
          publish,
          starts_at: startsAt,
          questions,
        }),
      });
      const json = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Exam could not be saved.");
      setMessage(json.message ?? (initialExam ? "Exam updated." : "Exam created."));
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Exam could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="paper-builder" onSubmit={saveExam}>
      <div className="builder-intro">
        <div>
          <span className="eyebrow">EXAM AUTHORING</span>
          <h3>{initialExam ? "Edit exam" : "Create an exam"}</h3>
          <p>Build an MCQ exam. Every question needs four choices and one answer key.</p>
        </div>
      </div>
      {message && <div className="notice warning" role="alert">{message}</div>}
      <div className="paper-fields">
        <div><label htmlFor="paper-title">Exam name</label><input id="paper-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={140} placeholder="e.g. Unit assessment" /></div>
        <div><label htmlFor="paper-session">Academic session</label><input id="paper-session" value={session} onChange={event => setSession(event.target.value)} required maxLength={40} /></div>
        <div><label htmlFor="paper-subject">Subject</label><select id="paper-subject" value={subject} onChange={event => setSubject(event.target.value)}><option>Biology</option><option>Physics</option><option>Chemistry</option></select></div>
        <div><label htmlFor="paper-chapter">Chapter name</label><input id="paper-chapter" value={formatDisplayText(chapter)} onChange={event => setChapter(event.target.value.replaceAll("Microbes ", "Microbes: "))} required maxLength={140} placeholder="Chapter / unit" /></div>
        <div><label htmlFor="paper-group">Class group</label><select id="paper-group" value={group} onChange={event => { setGroup(event.target.value); setShareClass10(false); }}>{groups.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div>
        <div><label htmlFor="exam-starts-at">Exam start date &amp; time</label><input id="exam-starts-at" type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required /><small>Students can start during the 24 hours after this time.</small></div>
        <div><label htmlFor="paper-duration">Attempt duration (minutes)</label><input id="paper-duration" type="number" min={1} max={300} value={duration} onChange={event => setDuration(Number(event.target.value))} required /></div>
        <div><label htmlFor="paper-passing">Passing marks</label><input id="paper-passing" type="number" min={0} max={maxMarks} step="0.25" value={passingMarks} onChange={event => setPassingMarks(Number(event.target.value))} required /></div>
      </div>
      {startsAt && <p className="exam-schedule-note">Exam access closes: {getExamEndPreview(startsAt)} (24 hours after start). The attempt timer remains {duration} minutes.</p>}
      {isClass10 && (
        <label className="share-paper">
          <input type="checkbox" checked={shareClass10} onChange={event => setShareClass10(event.target.checked)} />
          <span><b>Share the exact same exam with Class 10 Boys and Girls</b><small>Both classes keep independent enrollments, attempts, results and rankings.</small></span>
        </label>
      )}
      <div className="question-builder-head">
        <div><h4>Questions</h4><span>{questions.length} questions · {maxMarks} total marks</span></div>
        <div className="question-builder-actions">
          <button type="button" className="question-collapse-action" onClick={() => setQuestionsVisible(false)} disabled={!questionsVisible}>Hide all questions</button>
          <button type="button" className="question-collapse-action" onClick={() => setQuestionsVisible(true)} disabled={questionsVisible}>Show all questions</button>
          <button className="button button-secondary add-question" type="button" onClick={() => { setQuestionsVisible(true); setQuestions(current => [...current, newQuestion()]); }}><Plus size={14} /> Add question</button>
        </div>
      </div>
      {questionsVisible && <div className="question-drafts">
        {questions.map((question, index) => (
          <article className="question-draft" key={index}>
            <div className="draft-head">
              <b>Question {index + 1}</b>
              <div className="draft-actions">
                <label>Marks <input type="number" min={0.25} step="0.25" value={question.marks} onChange={event => updateQuestion(index, { marks: Number(event.target.value) })} /></label>
                {questions.length > 1 && <button type="button" className="icon-danger" aria-label={`Remove question ${index + 1}`} onClick={() => removeQuestion(index)}><Trash2 size={15} /></button>}
              </div>
            </div>
            <div className="question-editor">
              <textarea value={question.body} onChange={event => updateQuestion(index, { body: event.target.value })} placeholder="Type the question text" rows={2} required maxLength={2000} />
              <div className="option-editor">
                {question.options.map((option, optionIndex) => (
                  <label className="option-edit" key={option.label}>
                    <input type="radio" name={`correct-${index}`} checked={option.is_correct} onChange={() => setCorrect(index, optionIndex)} aria-label={`Mark option ${option.label} correct`} />
                    <span>{option.label}</span>
                    <input value={option.body} onChange={event => updateOption(index, optionIndex, event.target.value)} placeholder={`Option ${option.label}`} required maxLength={500} />
                  </label>
                ))}
              </div>
              <p className="answer-help">Select the radio button beside the correct answer. The key stays server-side.</p>
            </div>
          </article>
        ))}
      </div>}
      <div className="builder-footer">
        <label className="publish-toggle"><input type="checkbox" checked={publish} onChange={event => setPublish(event.target.checked)} /><span>Publish this exam for the scheduled start time</span></label>
        <button className="button button-primary" disabled={busy || !questionsLoaded || passingMarks > maxMarks}><Save size={15} />{busy ? initialExam && !questionsLoaded ? "Loading exam…" : "Saving exam…" : initialExam ? "Save exam changes" : publish ? "Schedule and publish exam" : "Save exam as draft"}</button>
      </div>
    </form>
  );
}
