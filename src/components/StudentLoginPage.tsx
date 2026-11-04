"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";

const classes = [
  ["Class 8", "class-8"], ["Class 9", "class-9"], ["Class 10 Boys", "class-10-boys"],
  ["Class 10 Girls", "class-10-girls"], ["Class 11", "class-11"], ["Class 12", "class-12"],
];

export function StudentLoginPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/student/session", { cache: "no-store" }).then(response => {
      if (active && response.ok) router.replace("/studentdashboard");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/student/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, classSlug, rollNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Student sign-in failed.");
      router.replace("/studentdashboard");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Student sign-in failed."); }
    finally { setBusy(false); }
  }

  return <main className="public-result-page"><section className="result-lookup-card teacher-entry-card" aria-label="Student login">
    <header className="lookup-heading"><div className="lookup-logo"><Image src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} unoptimized/><span>Estd. 2011</span></div><div><b>GLORIOUS COACHING CENTRE</b><small>ARANDA, HASANPURA</small></div></header>
    <div className="lookup-rule"/><h2 className="text-gray-500">Student Login</h2><p>Enter the name and roll number registered with your class.</p>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <form className="lookup-form" onSubmit={submit}>
      <label htmlFor="student-login-name">Student name</label><input id="student-login-name" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} required maxLength={120}/>
      <label htmlFor="student-login-class">Class</label><select id="student-login-class" value={classSlug} onChange={event => setClassSlug(event.target.value)} required><option value="" disabled>Select class</option>{classes.map(([label, slug]) => <option key={slug} value={slug}>{label}</option>)}</select>
      <label htmlFor="student-login-roll">Roll number</label><input id="student-login-roll" value={rollNumber} onChange={event => setRollNumber(event.target.value)} required maxLength={32}/>
      <button className="button button-primary lookup-submit" disabled={busy}>{busy ? "Verifying student…" : "Continue to dashboard"}<ArrowRight size={15}/></button>
    </form>
    <div className="teacher-login-note"><LockKeyhole size={15}/><span>Registered students open their assigned exams. For a camera test, use a name starting with “Test” (for example, “testing”); the test account sees the selected class’s assigned exams, and only its attempts reset on logout.</span></div>
    <footer className="lookup-footer" style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
      <button type="button" onClick={() => router.push("/teacher/login")} className="button button-primary lookup-submit">Teacher Login</button>


      <button type="button" onClick={() => router.push("/admin/login")} className="button button-primary lookup-submit">Admin Login</button>
    </footer>
  </section></main>;
}
