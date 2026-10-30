"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck, User } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/session", { cache: "no-store" })
      .then(res => {
        if (active && res.ok) router.replace("/admin/dashboard");
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
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Admin authentication failed.");
      }
      router.replace("/admin/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin login failed.");
      setBusy(false);
    }
  }

  return (
    <main className="public-result-page">
      <section className="result-lookup-card teacher-entry-card" aria-label="Administrator login">
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
        <h2>Administrator Login</h2>
        <p>Access school dashboard, class-wise examination results and student fee records.</p>

        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}

        <form className="lookup-form" onSubmit={submit}>
          <label htmlFor="admin-username">Admin username</label>
          <div className="teacher-login-input">
            <User size={15} />
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="e.g. admin"
              required
            />
          </div>

          <label htmlFor="admin-password">Admin password</label>
          <div className="teacher-login-input">
            <LockKeyhole size={15} />
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Enter admin password"
              required
            />
          </div>

          <button className="button button-primary lookup-submit" disabled={busy || !password.trim()}>
            <span>{busy ? "Verifying administrator…" : "Sign In to Admin Dashboard"}</span>
            <ArrowRight size={15} />
          </button>
        </form>

        <div className="teacher-login-note">
          <ShieldCheck size={15} />
          <span>Restricted access for school management and authorized personnel only.</span>
        </div>

        <footer className="lookup-footer">
          <button type="button" onClick={() => router.push("/teacher/login")}>
            Teacher Login
          </button>
        </footer>
      </section>
    </main>
  );
}

