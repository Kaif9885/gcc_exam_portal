"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardList, BookOpenCheck } from "lucide-react";

type DashboardPayload = {
  student: { fullName: string; rollNumber: string; className: string; board: string };
  exams: { id: string; title: string; subject: string; chapter: string; durationSeconds: number; status: string; startsAt: string | null; result: { marks: number; maxMarks: number; percentage: number } | null }[];
  results: { examId: string; title: string; subject: string; chapter: string; examDate: string | null; submittedAt: string | null; marks: number; maxMarks: number; percentage: number }[];
};

export function StudentDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/student/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401) { router.replace("/student"); return; }
      if (!response.ok) throw new Error(payload.error || "Could not load your dashboard.");
      setData(payload as DashboardPayload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your dashboard."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    await fetch("/api/student/session", { method: "DELETE" });
    router.replace("/student");
  }

  const activeExamsCount = data?.exams.filter(exam => !["submitted", "locked", "invalid", "closed"].includes(exam.status)).length ?? 0;

  return (
    <main className="public-result-page">
      <section className="result-lookup-card teacher-entry-card" aria-label="Student dashboard">
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

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <h3 style={{ color: "#4b5563", fontSize: "16px" }}>Loading your dashboard…</h3>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div className="notice warning" role="alert">{error}</div>
            <button className="button button-primary lookup-submit" onClick={() => void load()}>Retry</button>
          </div>
        ) : data && (
          <>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "4px 0 8px", color: "#1f2937" }}>
                Welcome, {data.student.fullName}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginTop: "10px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", background: "#f0f4fc", color: "#1f4b99", padding: "5px 12px", borderRadius: "16px", fontSize: "11px", fontWeight: 600, border: "1px solid #dce6f8" }}>
                  Class: {data.student.className}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", background: "#f0f4fc", color: "#1f4b99", padding: "5px 12px", borderRadius: "16px", fontSize: "11px", fontWeight: 600, border: "1px solid #dce6f8" }}>
                  Roll No: {data.student.rollNumber}
                </span>
                {data.student.board && (
                  <span style={{ display: "inline-flex", alignItems: "center", background: "#f0f4fc", color: "#1f4b99", padding: "5px 12px", borderRadius: "16px", fontSize: "11px", fontWeight: 600, border: "1px solid #dce6f8" }}>
                    Board: {data.student.board}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-primary lookup-submit"
                style={{
                  height: "44px",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  margin: 0
                }}
                onClick={() => router.push("/student/results")}
              >
                <ClipboardList size={17} />
                <span>View results ({data.results.length})</span>
                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                className="button button-primary lookup-submit"
                style={{
                  height: "44px",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  margin: 0
                }}
                onClick={() => router.push("/student/exams")}
              >
                <BookOpenCheck size={17} />
                <span>Attend exam ({activeExamsCount})</span>
                <ArrowRight size={15} />
              </button>
            </div>

            <footer className="lookup-footer" style={{ display: "flex", justifyContent: "center", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => void signOut()}
                className="button button-secondary"
                style={{
                  height: "34px",
                  padding: "0 18px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151"
                }}
              >
                Sign out
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
