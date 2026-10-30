"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, LockKeyhole } from "lucide-react";

const classes = [
  { name: "Class 8", slug: "class-8" },
  { name: "Class 9", slug: "class-9" },
  { name: "Class 10 Boys", slug: "class-10-boys" },
  { name: "Class 10 Girls", slug: "class-10-girls" },
  { name: "Class 11", slug: "class-11" },
  { name: "Class 12", slug: "class-12" },
];
const boards = ["BSEB", "CBSE"] as const;

export function StudentRegistrationForm({ onBack }: { onBack: () => void }) {
  const [fullName, setFullName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [groupSlug, setGroupSlug] = useState("class-8");
  const [board, setBoard] = useState<(typeof boards)[number]>("BSEB");
  const [subject, setSubject] = useState<string>("Biology");
  const [chapterName, setChapterName] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const availableSubjects = groupSlug === "class-9" ? ["Physics"] : ["class-8", "class-10-boys", "class-10-girls", "class-11", "class-12"].includes(groupSlug) ? ["Biology"] : [];
  const availableChapters = subject === "Biology" && groupSlug === "class-8" ? ["Microbes: Friend and Foe"] : subject === "Physics" && groupSlug === "class-9" ? ["Motion"] : subject === "Biology" && (groupSlug === "class-10-boys" || groupSlug === "class-10-girls") ? ["Control and Coordination"] : subject === "Biology" && groupSlug === "class-11" ? ["Biological Classification"] : subject === "Biology" && groupSlug === "class-12" ? ["Sexual Reproduction in Flowering Plants"] : [];
  const qrUrl = process.env.NEXT_PUBLIC_PAYMENT_QR_IMAGE_URL;
  const upiId = process.env.NEXT_PUBLIC_PAYMENT_UPI_ID;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(), roll_number: rollNumber.trim(), group_slug: groupSlug, board,
            subject, chapter_name: chapterName.trim(), payment_reference: paymentReference.trim(),
          },
        },
      });
      if (error) throw error;
      setMessage("Registration submitted. Verify your email if prompted. School staff must verify your ₹20 payment and approve your class/roll assignment before exam access is enabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Registration could not be submitted."); }
    finally { setBusy(false); }
  }

  return <div className="registration-wrap">
    <button className="back-button registration-back" type="button" onClick={onBack}>← Back to sign in</button>
    <div className="login-heading"><div className="eyebrow">STUDENT ENROLLMENT</div><h2>Create your account</h2><p>Submit your class and subject details. Exam access remains pending until school staff review your registration.</p></div>
    <div className="payment-box"><div className="payment-copy"><span className="eyebrow">ONE-TIME REGISTRATION PAYMENT</span><b>₹20</b><span>Scan the school’s verified payment QR code, pay ₹20 and enter the transaction reference below.</span>{upiId && <small>UPI ID: {upiId}</small>}</div>{qrUrl ? <Image className="payment-qr" src={qrUrl} alt="School payment QR code" width={128} height={128} unoptimized/> : <div className="qr-missing"><LockKeyhole size={21}/><span>Payment QR<br/>not configured</span></div>}</div>
    {message && <div className={`notice ${message.startsWith("Registration submitted") ? "success" : "warning"}`} role="status">{message}</div>}
    <form className="registration-form" onSubmit={submit}>
      <label htmlFor="reg-name">Student full name</label><input id="reg-name" value={fullName} onChange={event=>setFullName(event.target.value)} autoComplete="name" required maxLength={120}/>
      <div className="registration-grid"><div><label htmlFor="reg-board">Board</label><select id="reg-board" value={board} onChange={event=>setBoard(event.target.value as (typeof boards)[number])}>{boards.map(item=><option key={item}>{item}</option>)}</select></div><div><label htmlFor="reg-class">Class / group</label><select id="reg-class" value={groupSlug} onChange={event=>{const value=event.target.value;setGroupSlug(value);setSubject(value==="class-9"?"Physics":["class-8","class-10-boys","class-10-girls","class-11","class-12"].includes(value)?"Biology":"");setChapterName("")}}>{classes.map(group=><option key={group.slug} value={group.slug}>{group.name}</option>)}</select></div></div>
      <label htmlFor="reg-roll">Roll number</label><input id="reg-roll" value={rollNumber} onChange={event=>setRollNumber(event.target.value)} required maxLength={32}/>
      <div className="registration-grid"><div><label htmlFor="reg-subject">Subject</label><select id="reg-subject" value={subject} onChange={event=>{setSubject(event.target.value);setChapterName("")}} disabled={!availableSubjects.length} required><option value="" disabled>Select subject</option>{availableSubjects.map(item=><option key={item}>{item}</option>)}</select></div><div><label htmlFor="reg-chapter">Chapter name</label><select id="reg-chapter" value={chapterName} onChange={event=>setChapterName(event.target.value)} required disabled={!availableChapters.length}><option value="" disabled>Select chapter</option>{availableChapters.map(item=><option key={item}>{item}</option>)}</select></div></div>
      <label htmlFor="reg-ref">₹20 payment transaction reference</label><input id="reg-ref" value={paymentReference} onChange={event=>setPaymentReference(event.target.value)} placeholder="UPI transaction / UTR reference" required maxLength={100}/>
      <label htmlFor="reg-email">Email address</label><input id="reg-email" type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/>
      <label htmlFor="reg-password">Create password</label><input id="reg-password" type="password" value={password} onChange={event=>setPassword(event.target.value)} minLength={8} autoComplete="new-password" required/>
      <label className="accept-line registration-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} required/> I understand payment is manually verified and submitting a reference does not guarantee approval or exam access.</label>
      <button className="button button-primary registration-submit" disabled={busy || !consent}>{busy ? "Submitting…" : "Submit registration"}<ArrowRight size={16}/></button>
    </form>
  </div>;
}
