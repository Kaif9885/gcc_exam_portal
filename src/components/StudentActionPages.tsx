"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenCheck, CalendarDays, LockKeyhole } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";

type Exam = { id: string; title: string; subject: string; chapter: string; durationSeconds: number; status: string; startsAt: string | null; endsAt: string | null };
type StudentResult = { examId: string; title: string; subject: string; chapter: string; examDate: string | null; submittedAt: string | null; marks: number; maxMarks: number; percentage: number };
type Payload = { student: { fullName: string; rollNumber: string; className: string; testCandidate?: boolean }; exams: Exam[]; results: StudentResult[] };

function dateLabel(value: string | null) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not set"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}

export function StudentActionPages({ mode }: { mode: "exams" | "results" }) {
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

  const pageTitle = mode === "exams" ? "Scheduled Examinations" : "Examination Results";

  return (
    <main className="public-result-page">
      <section
        className="result-lookup-card teacher-entry-card"
        style={{ width: "min(100%, 560px)" }}
        aria-label={pageTitle}
      >
        <header className="lookup-heading">
          <div className="lookup-logo">
            <Image
              src="https://gcc-result-out.onrender.com/static/logo.jpeg"
              alt="Glorious Coaching Centre logo"
              width={64}
              height={64}
              unoptimized
            />
            <span>Estd. 2011</span>
          </div>
          <div>
            <b>GLORIOUS COACHING CENTRE</b>
            <small>ARANDA, HASANPURA</small>
          </div>
        </header>

        <div className="lookup-rule" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <button
            type="button"
            className="exam-back-button"
            onClick={() => router.push("/studentdashboard")}
            style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#2563eb", fontWeight: 600, background: "none", border: 0, cursor: "pointer" }}
          >
            <ArrowLeft size={14} /> Back to dashboard
          </button>
          {payload && (
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "4px 10px", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
              {payload.student.className} · Roll {payload.student.rollNumber}
            </span>
          )}
        </div>

        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", textAlign: "center", margin: "4px 0 16px" }}>
          {pageTitle}
        </h2>

        {loading ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading records…</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div className="notice warning" role="alert">{error}</div>
            <button className="button button-primary lookup-submit" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : mode === "results" ? (
          <div className="student-record-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {payload?.results.length ? (
              payload.results.map((result, index) => {
                const classLabel = payload.student.className.replace(/^Class\s*/i, "Class - ");
                return (
                  <article className="student-record-card student-result-record-card" key={`${result.examId}-${index}`}>
                    <h3>{classLabel}, {result.subject} — {formatDisplayText(result.chapter || result.title)}</h3>
                    <table className="student-result-record-table" aria-label="Student exam result record">
                      <tbody>
                        <tr><th scope="row">Student name</th><td>{payload.student.fullName}</td></tr>
                        <tr><th scope="row">Roll No.</th><td>{payload.student.rollNumber}</td></tr>
                        <tr><th scope="row">Exam start date</th><td>{dateLabel(result.examDate)}</td></tr>
                        <tr><th scope="row">Submitted</th><td>{dateLabel(result.submittedAt)}</td></tr>
                        <tr><th scope="row">Total marks</th><td>{result.maxMarks}</td></tr>
                        <tr><th scope="row">Obtained marks</th><td>{result.marks}</td></tr>
                        <tr><th scope="row">Percentage</th><td>{Number(result.percentage).toFixed(1)}%</td></tr>
                      </tbody>
                    </table>
                  </article>
                );
              })
            ) : (
              <div className="empty-exams" style={{ textAlign: "center", padding: "28px 12px", color: "#6b7280" }}>
                <LockKeyhole size={20} style={{ margin: "0 auto 8px", display: "block", color: "#9ca3af" }} />
                <span>No published exam results are available yet.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="student-record-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {payload?.exams.length ? (
              payload.exams.map(exam => {
                const blocked = ["submitted", "locked", "invalid", "closed"].includes(exam.status);
                const scheduled = exam.status === "scheduled";
                const ongoing = exam.status === "in_progress";
                const statusLabel = exam.status === "available" ? "LIVE" : exam.status.replaceAll("_", " ");
                return (
                  <article className="student-record-card" key={exam.id}>
                    <div className="student-record-icon"><BookOpenCheck size={19} /></div>
                    <div className="student-record-main">
                      <h3>{formatDisplayText(exam.title)}</h3>
                      <p>{exam.subject} · {formatDisplayText(exam.chapter)}</p>
                      <span>
                        <CalendarDays size={13} /> {exam.startsAt ? `Starts ${dateLabel(exam.startsAt)} · Access closes ${dateLabel(exam.endsAt)}` : "Schedule: open"} · {Math.round(exam.durationSeconds / 60)}-minute attempt
                      </span>
                    </div>
                    <div className="student-exam-action">
                      <span className={`result-status status-${exam.status} ${exam.status === "available" ? "exam-live-badge" : ""}`}>{statusLabel}</span>
                      <button
                        className="button button-primary"
                        disabled={blocked || scheduled}
                        onClick={() => router.push(ongoing ? `/exam/${exam.id}` : `/student/payment/${exam.id}`)}
                      >
                        {ongoing ? "Continue exam" : scheduled ? "Not started" : "Start exam"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-exams" style={{ textAlign: "center", padding: "28px 12px", color: "#6b7280" }}>
                <LockKeyhole size={20} style={{ margin: "0 auto 8px", display: "block", color: "#9ca3af" }} />
                <span>No published examination is assigned to your class yet.</span>
              </div>
            )}
          </div>
        )}

        <footer className="lookup-footer" style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => router.push("/studentdashboard")}
            className="button button-secondary"
            style={{
              height: "36px",
              padding: "0 20px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151"
            }}
          >
            Back to dashboard
          </button>
        </footer>
      </section>
    </main>
  );
}
