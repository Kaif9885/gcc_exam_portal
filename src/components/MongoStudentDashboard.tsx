"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap, LockKeyhole, ShieldCheck, ClipboardList, BookOpenCheck } from "lucide-react";

type DashboardPayload = {
  student: { fullName: string; rollNumber: string; className: string; board: string };
  exams: { id: string; title: string; subject: string; chapter: string; durationSeconds: number; status: string; startsAt: string | null; result: { marks: number; maxMarks: number; percentage: number } | null }[];
  results: { examId: string; title: string; subject: string; chapter: string; examDate: string | null; submittedAt: string | null; marks: number; maxMarks: number; percentage: number }[];
};

export function MongoStudentDashboard() {
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

  return <main className="dashboard-shell min-h-screen" style={{ margin:0, padding:0, width:"100%", backgroundColor: "#e0f7ff" }}>
    <header className="topbar flex items-center justify-between px-4 py-2" style={{ backgroundColor: "#ff9900" }}>
      <a className="brand flex items-center" href="/studentdashboard">
        <span className="brand-mark mr-2">
          <img src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="GLORIOUS COACHING CENTRE" width={24} height={24} className="inline-block" />
        </span>
        <span><b>GLORIOUS</b><small>COACHING CENTRE</small></span>
      </a>

      <div className="top-actions flex items-center gap-4">
        <span className="secure-label flex items-center flex-shrink-0">
          <ShieldCheck size={15} />
          <span className="ml-1">Student portal</span>
          
        </span>
        <button className="button button-secondary flex items-center" onClick={() => void signOut()}>
          Sign out
          
        </button>
      </div>
    </header>
    {loading ? (
        <section className="dashboard-content">
          <article className="exam-card">
            <h2>Loading your dashboard…</h2>
          </article>
        </section>
      ) : error ? (
        <section className="dashboard-content">
          <div className="notice warning" role="alert">{error}</div>
          <button className="button button-primary" onClick={() => void load()}>Retry</button>
        </section>
      ) : data && (
        <>

      <section className="welcome-wrap"><div className="welcome"><div><div className="eyebrow">STUDENT DASHBOARD</div><h1>Welcome, {data.student.fullName}</h1><p>{data.student.className} · Roll {data.student.rollNumber} · {data.student.board}</p></div><div className="welcome-icon"><GraduationCap size={28}/></div></div></section>
      <section className="dashboard-content"><div className="section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 className="inline-flex items-center"><span className="bg-blue-600 rounded-full p-1 mr-2"><GraduationCap size={20} className="text-white"/></span>Student dashboard</h2></div><span className="live-pill"><i/> Atlas connected</span></div>
        <div className="student-layout"><article className="exam-card"><div className="exam-card-top"><span className="subject-icon"><GraduationCap size={20}/></span><span className="status-badge">{data.exams.length} assigned</span></div><div className="exam-meta text-gray-400">GLORIOUS HIGH-TECH SCHOOL <span>•</span> EXAMINATION</div><h3>What would you like to do?</h3><p className="muted">Check your published marks or open an examination scheduled for your class.</p>
          <div className="student-dashboard-actions flex space-x-2"><button className="button button-primary" onClick={() => router.push("/student/results")}><ClipboardList size={16}/>View results ({data.results.length})<ArrowRight size={15}/></button><button className="button button-primary" onClick={() => router.push("/student/exams")}><BookOpenCheck size={16}/>Attend exam ({data.exams.filter(exam => !["submitted", "locked", "invalid", "closed"].includes(exam.status)).length})<ArrowRight size={15}/></button></div>
          <p className="card-footnote"><ShieldCheck size={14}/> Your identity is verified against the school roster in MongoDB Atlas.</p>
        </article>
</div>
      </section>
    </> )}
  </main>;
}
