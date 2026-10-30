"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, GraduationCap, LockKeyhole, User } from "lucide-react";

const approvedTeachers = [
  "Waseem Akram",
  "Md Naseem",
  "Md Meraj",
  "Tabrej Alam",
  "Md Arif",
  "Md Reyaj",
  "Nisha Kumari",
  "Nargis Bano",
  "Er. Faiz",
];

export default function TeacherLoginPage() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/teacher/session", { cache: "no-store" })
      .then(res => {
        if (active && res.ok) router.replace("/teacher");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherName, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Teacher sign-in failed.");
      }
      router.replace("/teacher");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Teacher login failed.");
      setBusy(false);
    }
  }

  return (
    <main className="public-result-page">
      <section className="result-lookup-card teacher-entry-card" aria-label="Faculty teacher login">
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
        <button className="exam-back-button" type="button" onClick={() => router.push("/student")}>
          <ArrowLeft size={13} /> Back to student portal
        </button>
        <h2>Teacher Login</h2>
        <p>Select your faculty name and enter your password to access the teacher portal.</p>

        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}

        <form className="lookup-form" onSubmit={submit}>
          <label htmlFor="teacher-select-name">Faculty member</label>
          <div className="teacher-login-input">
            <User size={15} />
            <select
              id="teacher-select-name"
              value={teacherName}
              onChange={event => setTeacherName(event.target.value)}
              required
              style={{ width: "100%", background: "transparent", border: 0, outline: 0, color: "#26364f", fontSize: 11 }}
            >
              <option value="" disabled>Select your name</option>
              {approvedTeachers.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <label htmlFor="teacher-password">Teacher password</label>
          <div className="teacher-login-input">
            <LockKeyhole size={15} />
            <input
              id="teacher-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter teacher password"
              required
            />
          </div>

          <button className="button button-primary lookup-submit" disabled={busy || !teacherName || !password.trim()}>
            <span>{busy ? "Signing in…" : "Sign In to Teacher Dashboard"}</span>
            <ArrowRight size={15} />
          </button>
        </form>

        <div className="teacher-login-note">
          <GraduationCap size={15} />
          <span>Access class results, question papers, live exam sessions and student rosters.</span>
        </div>

        <footer className="lookup-footer" style={{ display: "flex", gap: 14, justifyContent: "center" }}>
          <button type="button" onClick={() => router.push("/admin/login")}>
            Admin Login
          </button>
        </footer>
      </section>
    </main>
  );
}
