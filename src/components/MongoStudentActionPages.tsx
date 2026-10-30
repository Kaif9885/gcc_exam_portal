"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenCheck, CalendarDays, ClipboardList, GraduationCap, LockKeyhole } from "lucide-react";

type Exam = { id: string; title: string; subject: string; chapter: string; durationSeconds: number; status: string; startsAt: string | null; endsAt: string | null };
type StudentResult = { examId: string; title: string; subject: string; chapter: string; examDate: string | null; submittedAt: string | null; marks: number; maxMarks: number; percentage: number };
type Payload = { student: { fullName: string; rollNumber: string; className: string }; exams: Exam[]; results: StudentResult[] };

function dateLabel(value: string | null) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function MongoStudentActionPages({ mode }: { mode: "exams" | "results" }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/student/dashboard", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (response.status === 401) { router.replace("/student"); return; }
      if (!response.ok) throw new Error(data.error || "Could not load student records.");
      if (active) setPayload(data as Payload);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load student records."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  const pageTitle = mode === "exams" ? "Scheduled examinations" : "Examination results";
  return <main className="dashboard-shell">
    <header className="topbar"><a className="brand" href="/studentdashboard"><span className="brand-mark"><GraduationCap size={23}/></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></a><div className="top-actions"><button className="button button-secondary" onClick={() => router.push("/studentdashboard")}>Dashboard</button></div></header>
    <section className="dashboard-content student-action-page"><button className="exam-back-button" onClick={() => router.push("/studentdashboard")}><ArrowLeft size={14}/> Back to dashboard</button>
      <div className="section-heading"><div><span className="eyebrow">{payload ? `${payload.student.className} · ROLL ${payload.student.rollNumber}` : "STUDENT PORTAL"}</span><h2>{pageTitle}</h2></div><span className="live-pill"><i/> Atlas connected</span></div>
      {loading ? <article className="exam-card"><p>Loading…</p></article> : error ? <div className="notice warning" role="alert">{error}</div> : mode === "results" ? <div className="student-record-list">
        {payload?.results.length ? payload.results.map((result, index) => <article className="student-record-card" key={`${result.examId}-${index}`}><div className="student-record-icon"><ClipboardList size={19}/></div><div className="student-record-main"><h3>{result.title}</h3><p>{result.subject} · {result.chapter}</p><span><CalendarDays size={13}/> Exam: {dateLabel(result.examDate)}{result.submittedAt ? ` · Submitted: ${dateLabel(result.submittedAt)}` : ""}</span></div><div className="student-record-score"><small>OBTAINED MARKS</small><b>{result.marks} <i>/ {result.maxMarks}</i></b><span>{Number(result.percentage).toFixed(1)}%</span></div></article>) : <div className="empty-exams"><LockKeyhole size={17}/><span>No published exam results are available yet.</span></div>}
      </div> : <div className="student-record-list">
        {payload?.exams.length ? payload.exams.map(exam => {
          const blocked = ["submitted", "locked", "invalid", "closed"].includes(exam.status);
          const scheduled = exam.status === "scheduled";
          const ongoing = exam.status === "in_progress";
          return <article className="student-record-card" key={exam.id}><div className="student-record-icon"><BookOpenCheck size={19}/></div><div className="student-record-main"><h3>{exam.title}</h3><p>{exam.subject} · {exam.chapter}</p><span><CalendarDays size={13}/> {exam.startsAt ? `Starts ${dateLabel(exam.startsAt)}` : "Schedule: open"} · {Math.round(exam.durationSeconds / 60)} minutes</span></div><div className="student-exam-action"><span className={`result-status status-${exam.status}`}>{exam.status.replaceAll("_", " ")}</span><button className="button button-primary" disabled={blocked || scheduled} onClick={() => router.push(ongoing ? `/exam/${exam.id}` : `/student/payment/${exam.id}`)}>{ongoing ? "Continue exam" : scheduled ? "Not started" : "Start exam"}<ArrowRight size={14}/></button></div></article>;
        }) : <div className="empty-exams"><LockKeyhole size={17}/><span>No published examination is assigned to your class yet.</span></div>}
      </div>}
    </section>
  </main>;
}
