"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Download, GraduationCap, LockKeyhole, Smartphone } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";
import { MathText } from "@/components/MathText";
import { formatOptionLabel } from "@/lib/format-option-label";

const boards = ["BSEB", "CBSE"];
const classes = [
  { label: "Class 8", value: "class-8" },
  { label: "Class 9", value: "class-9" },
  { label: "Class 10 Boys", value: "class-10-boys" },
  { label: "Class 10 Girls", value: "class-10-girls" },
  { label: "Class 11", value: "class-11" },
  { label: "Class 12", value: "class-12" },
];

type Props = { onSignIn: () => void; onTeacherLogin: () => void };
type DemoQuestion = { body: string; marks: number; options: { label: string; body: string }[] };
type DemoResult = {
  marks_obtained: number;
  max_marks: number;
  percentage: number;
  answered_count: number;
  questions: (DemoQuestion & { selected_option: string | null })[];
};

export function StudentExamGate({ onSignIn, onTeacherLogin }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const routeStep = pathname === "/registration/exam" ? 2 : pathname === "/registration/payment" ? 3 : 1;
  const [step, setStep] = useState<1 | 2 | 3>(routeStep);
  const [draftRestored, setDraftRestored] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [board, setBoard] = useState("");
  const [classGroup, setClassGroup] = useState("");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  // QR-based payment removed – using UPI deep‑link button instead
  const [paymentRequestToken, setPaymentRequestToken] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "submitting" | "pending" | "verified" | "rejected">("idle");
  const [paymentError, setPaymentError] = useState("");
  const [demoQuestions, setDemoQuestions] = useState<DemoQuestion[] | null>(null);
  const [demoPaperTitle, setDemoPaperTitle] = useState("Class 12 Biology demo paper");
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoSelectedOption, setDemoSelectedOption] = useState("");
  const [demoAnswers, setDemoAnswers] = useState<Record<number, string>>({});
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoSecondsLeft, setDemoSecondsLeft] = useState(45);
  const [demoError, setDemoError] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [qrUnavailable, setQrUnavailable] = useState(false);
  const paymentQr = process.env.NEXT_PUBLIC_PAYMENT_QR_IMAGE_URL || "/payments/phonepe-payment-qr.jpg";
  const availableSubjects = classGroup === "class-9" ? ["Physics"] : ["class-8", "class-10-boys", "class-10-girls", "class-11", "class-12"].includes(classGroup) ? ["Biology"] : [];
  const availableChapters = subject === "Biology" && classGroup === "class-8" ? ["Microbes: Friend and Foe"]
    : subject === "Physics" && classGroup === "class-9" ? ["Motion"]
    : subject === "Biology" && (classGroup === "class-10-boys" || classGroup === "class-10-girls") ? ["Control and Coordination"]
    : subject === "Biology" && classGroup === "class-12" ? ["Sexual Reproduction in Flowering Plants"]
    : subject === "Biology" && classGroup === "class-11" ? ["Biological Classification"] : [];

  useEffect(() => {
    setStep(routeStep);
  }, [routeStep]);

  useEffect(() => {
    if (pathname === "/") router.replace("/registration/details");
    try {
      const saved = sessionStorage.getItem("ghs_registration_draft");
      if (saved) {
        const draft = JSON.parse(saved) as Record<string, unknown>;
        if (typeof draft.studentName === "string") setStudentName(draft.studentName);
        if (typeof draft.rollNumber === "string") setRollNumber(draft.rollNumber);
        if (typeof draft.board === "string") setBoard(draft.board);
        if (typeof draft.classGroup === "string") setClassGroup(draft.classGroup);
        if (typeof draft.subject === "string") setSubject(draft.subject);
        if (typeof draft.chapter === "string") setChapter(draft.chapter);
        if (typeof draft.payerName === "string") setPayerName(draft.payerName);
        if (typeof draft.paidAt === "string") setPaidAt(draft.paidAt);
        if (typeof draft.paymentConfirmed === "boolean") setPaymentConfirmed(draft.paymentConfirmed);
      }
    } catch { sessionStorage.removeItem("ghs_registration_draft"); }
    setDraftRestored(true);
  }, [pathname, router]);

  useEffect(() => {
    if (pathname !== "/registration/demo-result") return;
    try {
      const saved = sessionStorage.getItem("ghs_demo_result");
      if (saved) setDemoResult(JSON.parse(saved) as DemoResult);
      else router.replace("/registration/payment");
    } catch {
      sessionStorage.removeItem("ghs_demo_result");
      router.replace("/registration/payment");
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!draftRestored) return;
    sessionStorage.setItem("ghs_registration_draft", JSON.stringify({ studentName, rollNumber, board, classGroup, subject, chapter, payerName, paidAt, paymentConfirmed }));
  }, [draftRestored, studentName, rollNumber, board, classGroup, subject, chapter, payerName, paidAt, paymentConfirmed]);

  function navigateStep(next: 1 | 2 | 3) {
    setStep(next);
    router.push(next === 1 ? "/registration/details" : next === 2 ? "/registration/exam" : "/registration/payment");
  }

  useEffect(() => {
    if (!paymentRequestToken || paymentStatus !== "pending") return;
    let mounted = true;
    const checkStatus = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase.rpc("get_exam_payment_status", { p_status_token: paymentRequestToken });
        if (!mounted || error || !data) return;
        if (data.status === "verified" || data.status === "rejected") setPaymentStatus(data.status);
      } catch { /* Poll again; an unavailable service must not grant exam access. */ }
    };
    const timer = window.setInterval(() => void checkStatus(), 5000);
    void checkStatus();
    return () => { mounted = false; window.clearInterval(timer); };
  }, [paymentRequestToken, paymentStatus]);

  useEffect(() => {
    if (!demoQuestions) return;
    if (demoSecondsLeft <= 0) {
      if (demoQuestionIndex < demoQuestions.length - 1) {
        setDemoQuestionIndex(index => index + 1);
        setDemoSelectedOption("");
        setDemoSecondsLeft(45);
      }
      return;
    }
    const timer = window.setTimeout(() => setDemoSecondsLeft(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [demoQuestions, demoQuestionIndex, demoSecondsLeft]);


  function continueToExamForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateStep(2);
  }

  function openQuestions(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateStep(3);
  }

  async function openLimitedDemo() {
    setDemoError("");
    const demoSlug = classGroup;
    const expectedChapter: Record<string, string> = {
      "class-8": "Microbes: Friend and Foe",
      "class-9": "Motion",
      "class-10-boys": "Control and Coordination",
      "class-10-girls": "Control and Coordination",
      "class-11": "Biological Classification",
      "class-12": "Sexual Reproduction in Flowering Plants",
    };
    if (!demoSlug || !expectedChapter[demoSlug] || chapter.toLowerCase() !== expectedChapter[demoSlug].toLowerCase()) {
      setDemoError("Select a class, subject and chapter with an available demo paper first.");
      return;
    }
    try {
      const response = await fetch(`/api/demo-paper/${demoSlug}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Demo questions could not be loaded.");
      setDemoQuestions(payload.questions as DemoQuestion[]);
      setDemoPaperTitle(payload.title as string);
      setDemoQuestionIndex(0);
      setDemoSelectedOption("");
      setDemoAnswers({});
      setDemoResult(null);
      setDemoSecondsLeft(45);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Demo questions could not be loaded.");
    }
  }

  async function submitLimitedDemo() {
    if (!demoQuestions || demoSubmitting) return;
    setDemoSubmitting(true);
    setDemoError("");
    try {
      const answers = Object.entries(demoAnswers).map(([index, option]) => ({ question_index: Number(index), option_label: option }));
      const response = await fetch(`/api/demo-paper/${classGroup}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Demo answers could not be submitted.");
      setDemoResult(payload as DemoResult);
      sessionStorage.setItem("ghs_demo_result", JSON.stringify(payload));
      router.push("/registration/demo-result");
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Demo answers could not be submitted.");
    } finally {
      setDemoSubmitting(false);
    }
  }

  async function submitPaymentProof(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError("");
    setPaymentStatus("submitting");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const group = classes.find(item => item.value === classGroup);
      if (!group) throw new Error("Select your class again.");
      const { data, error } = await supabase.rpc("submit_exam_payment", {
        p_student_name: studentName.trim(), p_roll_number: rollNumber.trim(), p_board: board,
        p_group_slug: group.value, p_subject: subject, p_chapter_name: chapter,
        p_transaction_reference: null, p_payer_upi_id: null,
        p_payer_name: payerName.trim(), p_paid_at: new Date(paidAt).toISOString(),
      });
      if (error) throw error;
      setPaymentRequestToken(String(data));
      setPaymentStatus("pending");
    } catch (error) {
      setPaymentStatus("idle");
      setPaymentError(error instanceof Error ? error.message : "Payment details could not be submitted. Try again later.");
    }
  }

  if (pathname === "/registration/demo-result" && !demoResult) return <main className="public-result-page"><section className="result-lookup-card" role="status"><h2>Loading demo result…</h2></section></main>;
  if (demoResult) return <main className="public-result-page demo-result-page"><section className="result-lookup-card demo-marksheet">
    <header className="demo-marksheet-toolbar"><div><span className="demo-marksheet-kicker">GLORIOUS HIGH-TECH SCHOOL · DEMO</span><h2>Examination marksheet</h2><p>Submitted answers and selected options</p></div><div className="demo-marksheet-actions"><button className="button button-primary" onClick={()=>window.print()}><Download size={15}/>Download PDF</button><button className="button button-secondary" onClick={()=>{setDemoResult(null);setDemoQuestions(null);sessionStorage.removeItem("ghs_demo_result");router.replace("/registration/payment")}}>Close marksheet</button></div></header>
    <div className="demo-score-summary"><div><span>Score</span><b>{demoResult.marks_obtained} <small>/ {demoResult.max_marks}</small></b></div><div><span>Percentage</span><b>{demoResult.percentage.toFixed(1)}%</b></div><div><span>Answered</span><b>{demoResult.answered_count} <small>/ {demoResult.questions.length}</small></b></div></div>
    <h3 className="demo-answer-sheet-title">Question-wise answers</h3>
    <div className="demo-answer-sheet">{demoResult.questions.map((question,index)=><article className="demo-answer-question" key={index}><div className="demo-answer-question-head"><b>Question {index+1}</b><span>{question.marks} mark{question.marks===1?"":"s"}</span></div><p><MathText text={question.body}/></p><ol>{question.options.map((option,optionIndex)=><li className={question.selected_option===formatOptionLabel(option.label,optionIndex)?"chosen":""} key={formatOptionLabel(option.label,optionIndex)}><span>{question.selected_option===formatOptionLabel(option.label,optionIndex)?"✓":formatOptionLabel(option.label,optionIndex)}</span><MathText text={option.body}/></li>)}</ol>{!question.selected_option&&<small className="demo-unanswered">Not answered</small>}</article>)}</div>
  </section></main>;

  return <main className="public-result-page">
    <section className="result-lookup-card exam-entry-card" aria-label="Student online examination entry">
      <header className="lookup-heading">
        <div className="lookup-logo"><Image src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} unoptimized/><span>Estd. 2011</span></div>
        <div><b>GLORIOUS COACHING CENTRE</b><small>ARANDA, HASANPURA</small></div>
      </header>
      <div className="lookup-rule"/>
      <div className="exam-step-indicator"><span className={step === 1 ? "current" : "done"}>1</span><i/><span className={step === 2 ? "current" : step === 3 ? "done" : ""}>2</span><i/><span className={step === 3 ? "current" : ""}>3</span><small>{step === 1 ? "Student details" : step === 2 ? "Examination details" : "₹20 payment"}</small></div>
      {step === 1 && <>
        <h2>Student Details</h2>
        <p>Enter your registered name and roll number to continue to the online examination form.</p>
        <form className="lookup-form" onSubmit={continueToExamForm}>
          <label htmlFor="entry-name">Student name</label>
          <input id="entry-name" autoComplete="name" value={studentName} onChange={event=>setStudentName(event.target.value)} placeholder="Enter your full name" required maxLength={120}/>
          <label htmlFor="entry-roll">Roll number</label>
          <input id="entry-roll" value={rollNumber} onChange={event=>setRollNumber(event.target.value)} placeholder="Enter your roll number" required maxLength={32}/>
          <button className="button button-primary lookup-submit" type="submit"><span>Continue</span><ArrowRight size={15}/></button>
        </form>
      </>}
      {step === 2 && <>
        <button type="button" className="exam-back-button" onClick={()=>navigateStep(1)}><ArrowLeft size={13}/> Edit student details</button>
        <h2>Online Examination</h2>
        <p className="exam-student-summary"><GraduationCap size={14}/><b>{studentName}</b><span>Roll No. {rollNumber}</span></p>
        <form className="lookup-form" onSubmit={openQuestions}>
          <label htmlFor="entry-board">Board</label>
          <select id="entry-board" value={board} onChange={event=>setBoard(event.target.value)} required><option value="" disabled>Select board</option>{boards.map(item=><option key={item}>{item}</option>)}</select>
          <label htmlFor="entry-class">Class</label>
          <select id="entry-class" value={classGroup} onChange={event=>{setClassGroup(event.target.value);setSubject("");setChapter("")}} required><option value="" disabled>Select class</option>{classes.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <label htmlFor="entry-subject">Subject</label>
          <select id="entry-subject" value={subject} onChange={event=>{setSubject(event.target.value);setChapter("")}} required disabled={!availableSubjects.length}><option value="" disabled>Select subject</option>{availableSubjects.map(item=><option key={item}>{item}</option>)}</select>
          <label htmlFor="entry-chapter">Chapter name</label>
          <select id="entry-chapter" value={chapter} onChange={event=>setChapter(event.target.value)} required disabled={!subject || !availableChapters.length}><option value="" disabled>Select chapter</option>{availableChapters.map(item=><option key={item} value={item}>{formatDisplayText(item)}</option>)}</select>
          <button className="button button-primary lookup-submit" type="submit"><span>Continue to ₹20 payment</span><ArrowRight size={15}/></button>
        </form>
        <div className="exam-teacher-shortcut"><span>School staff?</span><button type="button" onClick={onTeacherLogin}>Teacher Login</button></div>
      </>}
      {step === 3 && <>
        <div className="exam-step-links"><button type="button" className="exam-back-button" onClick={()=>navigateStep(2)}><ArrowLeft size={13}/> Back to examination details</button><button type="button" onClick={onTeacherLogin}>Teacher Login</button></div>
        <h2>Pay ₹20 to continue</h2>
        <p className="payment-instructions">Scan the school’s PhonePe QR. After paying, enter the payer name and payment date/time below.</p>
        <div className="exam-payment-card">
          <div className="exam-payment-amount"><span>EXAM REGISTRATION FEE</span><b>₹20</b><small>Pay to Mohammad Arif</small></div>
          {!qrUnavailable ? <Image className="exam-payment-qr" src={paymentQr} alt="PhonePe payment QR code" width={240} height={240} unoptimized onError={()=>setQrUnavailable(true)}/> : <div className="exam-qr-missing"><Smartphone size={26}/><b>PhonePe QR required</b><span>Place the school scanner image in<br/>public/payments/phonepe-payment-qr.jpg</span></div>}
        </div>
        {demoQuestions ? <section className="demo-paper-preview"><div className="demo-paper-heading"><div><b>{demoPaperTitle}</b><div className="demo-progress"><span className="demo-progress-count">QUESTION {demoQuestionIndex+1} / {demoQuestions.length}</span><span className={`demo-progress-clock ${demoSecondsLeft<=10?"urgent":""}`}><Clock3 size={13}/>{String(Math.floor(demoSecondsLeft/60)).padStart(2,"0")}:{String(demoSecondsLeft%60).padStart(2,"0")}</span><span className="demo-progress-rate">45 sec per question</span></div></div><button type="button" className="exam-back-button" onClick={()=>setDemoQuestions(null)}>Close preview</button></div><article className="demo-paper-question"><b>Q{demoQuestionIndex+1}. <MathText text={demoQuestions[demoQuestionIndex]?.body ?? ""}/></b><div className="demo-options">{demoQuestions[demoQuestionIndex]?.options.map((option,optionIndex)=>{const label=formatOptionLabel(option.label,optionIndex);return <button type="button" className={demoSelectedOption===label?"selected":""} key={label} onClick={()=>{setDemoSelectedOption(label);setDemoAnswers(current=>({...current,[demoQuestionIndex]:label}))}}><span>{label}</span><MathText text={option.body}/></button>})}</div><div className="demo-question-actions"><small>{demoSecondsLeft===0?"Time is up for this question.":demoSelectedOption?"Option selected. Continue when ready.":"Select an option to continue; the next question opens automatically when time runs out."}</small><button className="button button-primary" type="button" disabled={demoSubmitting || (!demoSelectedOption && demoSecondsLeft>0)} onClick={()=>{if(demoQuestionIndex===demoQuestions.length-1){void submitLimitedDemo();return;}setDemoQuestionIndex(index=>index+1);setDemoSelectedOption("");setDemoSecondsLeft(45)}}>{demoQuestionIndex===demoQuestions.length-1?"Submit answers":"Next question"}<ArrowRight size={14}/></button></div></article></section> : paymentStatus === "idle" || paymentStatus === "submitting" ? <form className="lookup-form payment-confirm-form" onSubmit={submitPaymentProof}>
          <label htmlFor="payer-name">Name shown in PhonePe</label><input id="payer-name" value={payerName} onChange={event=>setPayerName(event.target.value)} placeholder="Payer account name" required maxLength={120}/>
          <label htmlFor="payment-time">Payment date and time</label><input id="payment-time" type="datetime-local" value={paidAt} onChange={event=>setPaidAt(event.target.value)} required/>
          <label className="payment-check-label"><input type="checkbox" checked={paymentConfirmed} onChange={event=>setPaymentConfirmed(event.target.checked)} required/><span>I have paid ₹20. School staff must verify this payment before exam access.</span></label>
          {paymentError && <div className="notice warning" role="alert">{paymentError}</div>}
          <button className="button button-primary lookup-submit" type="submit" disabled={!paymentConfirmed || !payerName.trim() || !paidAt || paymentStatus === "submitting"}><span>{paymentStatus === "submitting" ? "Submitting for verification…" : "Submit payment for verification"}</span><ArrowRight size={15}/></button>
          <button className="button button-secondary lookup-submit" type="button" onClick={()=>void openLimitedDemo()}>Open {classes.find(item=>item.value===classGroup)?.label ?? "selected class"} demo</button>
          {demoError && <div className="notice warning" role="alert">{demoError}</div>}
        </form> : <div className={`exam-auth-notice payment-status-${paymentStatus}`} role="status">
          {paymentStatus === "verified" ? <CheckCircle2 size={18}/> : <LockKeyhole size={18}/>}
          <div><b>{paymentStatus === "pending" ? "Payment verification pending" : paymentStatus === "verified" ? "Payment verified" : "Payment not verified"}</b>
            <span>{paymentStatus === "pending" ? "The school admin is checking your payment details and payment time. This page will update after review." : paymentStatus === "verified" ? "Continue to your secure school account. Your assigned examination is shown after eligibility checks." : "Please contact the school office or submit corrected payment details."}</span>
            {paymentStatus === "verified" && <button type="button" onClick={onSignIn}>Continue to secure exam access</button>}
            {paymentStatus === "rejected" && <button type="button" onClick={()=>{setPaymentStatus("idle");setPaymentRequestToken("")}}>Edit payment details</button>}
          </div>
        </div>}
      </>}
      <footer className="lookup-footer"><button type="button" onClick={onTeacherLogin}>Teacher Login</button></footer>
    </section>
  </main>;
}
