"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Download, GraduationCap } from "lucide-react";

type ExamQuestion = { id: string; body: string; position: number; marks: number; options: { id: string; label: string; body: string }[]; selectedOptionId: string | null };
type ExamState = { attempt: { id: string; expiresAt: string }; exam: { id: string; title: string; durationSeconds: number; subject: string }; questions: ExamQuestion[] };
type Submission = { marks: number; maxMarks: number; percentage: number; correctCount: number; incorrectCount: number; unansweredCount: number; submittedAt: string; answerReview: { questionId: string; selectedOptionId: string | null; correctOptionId: string | null; isCorrect: boolean; marks: number }[] };

export function MongoStudentExam() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<ExamState | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Submission | null>(null);
  const deadline = useRef(0);
  const advancing = useRef(false);
  const perQuestion = exam?.questions.length ? Math.max(1, Math.floor(exam.exam.durationSeconds / exam.questions.length)) : 45;
  const currentQuestion = exam?.questions[questionIndex];

  useEffect(() => {
    let active = true;
    void fetch(`/api/student/exams/${encodeURIComponent(examId)}/start`, { method: "POST" }).then(async response => {
      const payload = await response.json();
      if (response.status === 401) { router.replace("/student"); return; }
      if (!response.ok) {
        if (response.status === 402) router.replace(`/student/payment/${encodeURIComponent(examId)}`);
        else throw new Error(payload.error || "Could not start the exam.");
        return;
      }
      if (active) {
        const restoredExam = payload as ExamState;
        const savedIndex = Number(sessionStorage.getItem(`mongo-exam-index:${restoredExam.attempt.id}`) || "0");
        setQuestionIndex(Math.min(Math.max(0, savedIndex), restoredExam.questions.length - 1));
        setExam(restoredExam);
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not start the exam."); });
    return () => { active = false; };
  }, [examId, router]);

  useEffect(() => {
    if (!exam || result) return;
    const key = `mongo-exam-deadline:${exam.attempt.id}:${questionIndex}`;
    const stored = Number(sessionStorage.getItem(key) || "0");
    const hardEnd = new Date(exam.attempt.expiresAt).getTime();
    deadline.current = Math.min(stored > Date.now() ? stored : Date.now() + perQuestion * 1000, hardEnd);
    sessionStorage.setItem(key, String(deadline.current));
    setSecondsLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    const timer = window.setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [exam?.attempt.id, exam?.attempt.expiresAt, exam?.questions.length, exam?.exam.durationSeconds, questionIndex, perQuestion, result]);

  const finish = useCallback(async () => {
    if (!exam || submitting || result) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(examId)}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: exam.attempt.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not submit exam.");
      setResult(payload.result as Submission);
      Object.keys(sessionStorage).filter(key => key.startsWith(`mongo-exam-deadline:${exam.attempt.id}:`)).forEach(key => sessionStorage.removeItem(key));
      sessionStorage.removeItem(`mongo-exam-index:${exam.attempt.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit exam."); }
    finally { setSubmitting(false); }
  }, [exam, examId, result, submitting]);

  useEffect(() => {
    if (!exam || result) return;
    const timer = window.setInterval(() => { if (Date.now() >= new Date(exam.attempt.expiresAt).getTime()) void finish(); }, 500);
    return () => window.clearInterval(timer);
  }, [exam, result, finish]);

  const next = useCallback(async () => {
    if (!exam || advancing.current || result) return;
    advancing.current = true;
    try {
      if (questionIndex >= exam.questions.length - 1) await finish();
      else setQuestionIndex(index => { const nextIndex = index + 1; sessionStorage.setItem(`mongo-exam-index:${exam.attempt.id}`, String(nextIndex)); return nextIndex; });
    } finally { advancing.current = false; }
  }, [exam, finish, questionIndex, result]);

  useEffect(() => {
    if (secondsLeft !== 0 || !exam || result || submitting) return;
    void next();
  }, [secondsLeft, exam, result, submitting, next]);

  async function selectOption(optionId: string) {
    if (!exam || !currentQuestion || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(examId)}/answers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: exam.attempt.id, questionId: currentQuestion.id, optionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Answer could not be saved.");
      setExam(current => current ? { ...current, questions: current.questions.map(question => question.id === currentQuestion.id ? { ...question, selectedOptionId: optionId } : question) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Answer could not be saved."); }
    finally { setSaving(false); }
  }

  if (result && exam) return <main className="public-result-page"><section className="result-lookup-card mongo-exam-result"><header className="demo-marksheet-toolbar"><div><span className="demo-marksheet-kicker">GLORIOUS HIGH-TECH SCHOOL</span><h2>Exam submitted</h2><p>{exam.exam.title}</p></div><div className="demo-marksheet-actions"><button className="button button-primary" onClick={() => window.print()}><Download size={15}/>Download / Print</button><button className="button button-secondary" onClick={() => router.replace("/student/results")}>View all results</button></div></header><div className="demo-score-summary"><div><span>Score</span><b>{result.marks} <small>/ {result.maxMarks}</small></b></div><div><span>Percentage</span><b>{result.percentage.toFixed(1)}%</b></div><div><span>Correct</span><b>{result.correctCount} <small>/ {exam.questions.length}</small></b></div></div><h3 className="demo-answer-sheet-title">Question paper and selected answers</h3><div className="demo-answer-sheet">{exam.questions.map((question, index) => { const review = result.answerReview.find(item => item.questionId === question.id); return <article className="demo-answer-question" key={question.id}><div className="demo-answer-question-head"><b>Question {index + 1}</b><span>{review?.marks ?? 0} / {question.marks} marks</span></div><p>{question.body}</p><ol>{question.options.map(option => <li className={`${review?.selectedOptionId === option.id ? "chosen" : ""} ${review?.correctOptionId === option.id ? "correct-answer" : ""}`} key={option.id}><span>{review?.correctOptionId === option.id ? "✓" : option.label}</span>{option.body}{review?.selectedOptionId === option.id && <small> Your answer</small>}</li>)}</ol></article>; })}</div></section></main>;

  return <main className="public-result-page"><section className="result-lookup-card mongo-exam-shell"><button className="exam-back-button" onClick={() => router.push("/student/exams")}><ArrowLeft size={13}/> Exit exam</button>{error && <div className="notice warning" role="alert">{error}</div>}{!exam ? <div role="status"><h2>Opening exam…</h2></div> : currentQuestion && <><div className="mongo-exam-toolbar"><div><span>{exam.exam.title}</span><div className="demo-progress"><span className="demo-progress-count">QUESTION {questionIndex + 1} / {exam.questions.length}</span><span className={`demo-progress-clock ${secondsLeft <= 10 ? "urgent" : ""}`}><Clock3 size={13}/>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</span><span className="demo-progress-rate">{perQuestion} sec per question</span></div></div><span className="mongo-save-status">{saving ? "Saving…" : "Answers save automatically"}</span></div><article className="demo-paper-question mongo-exam-question"><b>Q{questionIndex + 1}. {currentQuestion.body}</b><div className="demo-options">{currentQuestion.options.map(option => <button type="button" className={currentQuestion.selectedOptionId === option.id ? "selected" : ""} key={option.id} onClick={() => void selectOption(option.id)} disabled={saving}><span>{option.label}</span>{option.body}</button>)}</div><div className="demo-question-actions"><small>{currentQuestion.selectedOptionId ? "Answer saved. Continue when ready." : "Select an option. The next question opens when the timer ends."}</small><button className="button button-primary" type="button" disabled={saving || (!currentQuestion.selectedOptionId && secondsLeft > 0) || submitting} onClick={() => void next()}>{submitting ? "Submitting…" : questionIndex === exam.questions.length - 1 ? "Submit exam" : "Next question"}<ArrowRight size={14}/></button></div></article><p className="card-footnote"><GraduationCap size={14}/> Refreshing will restore this attempt and saved answers.</p></>}</section></main>;
}
