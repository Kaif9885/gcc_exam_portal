"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, GraduationCap, LockKeyhole } from "lucide-react";

const teacherNames = ["Waseem Akram", "Md Naseem", "Md Meraj", "Tabrej Alam", "Md Arif", "Md Reyaj", "Nisha Kumari", "Nargis Bano", "Er. Faiz"];
const classes = [
  { label: "Class 8", value: "class-8" }, { label: "Class 9", value: "class-9" },
  { label: "Class 10 Boys", value: "class-10-boys" }, { label: "Class 10 Girls", value: "class-10-girls" },
  { label: "Class 11", value: "class-11" }, { label: "Class 12", value: "class-12" },
];
const accessChoices = [
  { value: "questions", label: "View question papers for a specific class" },
  { value: "monitor", label: "View active exam sessions" },
  { value: "results", label: "View class-wise results and top three after the exam" },
] as const;
export type TeacherLoginMode = (typeof accessChoices)[number]["value"];
export type TeacherLoginDetails = { teacherName: string; password: string; mode: TeacherLoginMode; groupSlug?: string; subject?: string; chapter?: string };
type Props = { onBack: () => void; onSubmit: (details: TeacherLoginDetails) => Promise<string | null> };

export function TeacherLoginGate({ onBack, onSubmit }: Props) {
  const [mode, setMode] = useState<TeacherLoginMode | "">("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [groupSlug, setGroupSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const availableSubjects = groupSlug === "class-9" ? ["Physics"] : ["class-8", "class-10-boys", "class-10-girls", "class-11", "class-12"].includes(groupSlug) ? ["Biology"] : [];
  const availableChapters = subject === "Biology" && groupSlug === "class-8" ? ["Microbes: Friend and Foe"] : subject === "Physics" && groupSlug === "class-9" ? ["Motion"] : subject === "Biology" && (groupSlug === "class-10-boys" || groupSlug === "class-10-girls") ? ["Control and Coordination"] : subject === "Biology" && groupSlug === "class-11" ? ["Biological Classification"] : subject === "Biology" && groupSlug === "class-12" ? ["Sexual Reproduction in Flowering Plants"] : [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    setBusy(true); setError("");
    const details: TeacherLoginDetails = { teacherName: fullName, password, mode };
    if (mode === "questions" || mode === "results") Object.assign(details, { groupSlug, subject, chapter });
    const result = await onSubmit(details);
    if (result) setError(result);
    setBusy(false);
  }

  return <main className="public-result-page"><section className="result-lookup-card teacher-entry-card" aria-label="Teacher secure login">
    <header className="lookup-heading"><div className="lookup-logo"><Image src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} unoptimized/><span>Estd. 2011</span></div><div><b>GLORIOUS COACHING CENTRE</b><small>ARANDA, HASANPURA</small></div></header>
    <div className="lookup-rule"/><button className="exam-back-button" type="button" onClick={onBack}><ArrowLeft size={13}/> Back to student exam form</button>
    <h2>Teacher Login</h2><p>Select the teacher access you need.</p>
    {error && <div className="notice warning" role="alert">{error}</div>}
    <form className="lookup-form teacher-entry-form" onSubmit={submit}>
      <label htmlFor="teacher-access">Access option</label><select id="teacher-access" value={mode} onChange={event => { setMode(event.target.value as TeacherLoginMode | ""); setError(""); }} required><option value="" disabled>Select what you want to open</option>{accessChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
      {mode && <>
        <label htmlFor="teacher-name">Teacher name</label><select id="teacher-name" value={fullName} onChange={event => setFullName(event.target.value)} required><option value="" disabled>Select your name</option>{teacherNames.map(name => <option key={name}>{name}</option>)}</select>
        <label htmlFor="teacher-password">Teacher password</label><div className="teacher-login-input"><LockKeyhole size={15}/><input id="teacher-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Shared teacher password" autoComplete="current-password" required/></div>
        {(mode === "questions" || mode === "results") && <>
          <label htmlFor="teacher-class">Class</label><select id="teacher-class" value={groupSlug} onChange={event => { setGroupSlug(event.target.value); setSubject(""); setChapter(""); }} required><option value="" disabled>Select class</option>{classes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <label htmlFor="teacher-subject">Subject</label><select id="teacher-subject" value={subject} onChange={event => { setSubject(event.target.value); setChapter(""); }} disabled={!availableSubjects.length} required><option value="" disabled>Select subject</option>{availableSubjects.map(item => <option key={item}>{item}</option>)}</select>
          <label htmlFor="teacher-chapter">Chapter name</label><select id="teacher-chapter" value={chapter} onChange={event => setChapter(event.target.value)} disabled={!subject || !availableChapters.length} required><option value="" disabled>Select chapter</option>{availableChapters.map(item => <option key={item}>{item}</option>)}</select>
        </>}
        <button className="button button-primary lookup-submit" type="submit" disabled={busy}>{busy ? "Verifying teacher access…" : mode === "questions" ? "Open question paper" : mode === "monitor" ? "Open active sessions" : "Open class results & Top 3"}<ArrowRight size={15}/></button>
      </>}
    </form>
    <div className="teacher-login-note"><GraduationCap size={15}/><span>Use your school-issued teacher name and shared password.</span></div>
  </section></main>;
}
