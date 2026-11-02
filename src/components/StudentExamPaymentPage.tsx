"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";

type PaymentPayload = {
  student: { fullName: string; rollNumber: string; board: string; className: string };
  exam: { id: string; title: string; subject: string; chapter: string; durationSeconds: number };
  payment: { status: "pending" | "verified" | "rejected"; statusToken: string; payerName?: string; paidAt?: string; method?: "cash" | "online" } | null;
};

export function StudentExamPaymentPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const [data, setData] = useState<PaymentPayload | null>(null);
  const [payerName, setPayerName] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online" | null>(null);
  const [onlinePaymentDone, setOnlinePaymentDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const qr = process.env.NEXT_PUBLIC_PAYMENT_QR_IMAGE_URL || "/PHOTO-2026-11-01-21-54-51.jpg";

  const load = useCallback(async (token?: string) => {
    const response = await fetch(`/api/student/exams/${encodeURIComponent(examId)}/payment${token ? `?token=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.status === 401) { router.replace("/student"); return null; }
    if (!response.ok) throw new Error(payload.error || "Could not load payment details.");
    return payload as PaymentPayload;
  }, [examId, router]);

  useEffect(() => {
    let active = true;
    void load()
      .then(payload => {
        if (active && payload) {
          setData(payload);
          // If payment details were already submitted, directly open the questions
          if (payload.payment?.status === "verified" || payload.payment?.status === "pending") {
            router.replace(`/exam/${encodeURIComponent(examId)}`);
          }
        }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load payment details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load, examId, router]);

  async function submitPayment(method: "cash" | "online", name: string, paymentTime: Date) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/student/exams/${encodeURIComponent(examId)}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerName: name, paidAt: paymentTime.toISOString(), paymentMethod: method }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Payment details could not be submitted.");
      router.push(`/exam/${encodeURIComponent(examId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment details could not be submitted.");
      setBusy(false);
    }
  }

  async function submitOnline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    await submitPayment("online", payerName, new Date(paidAt));
  }

  return (
    <main className="public-result-page">
      <section className="result-lookup-card exam-entry-card" aria-label="Exam payment">
        <header className="lookup-heading">
          <div className="lookup-logo">
            <img src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} />
            <span>Estd. 2011</span>
          </div>
          <div>
            <b>GLORIOUS COACHING CENTRE</b>
            <small>ARANDA, HASANPURA</small>
          </div>
        </header>
        <div className="lookup-rule" />
        <button className="exam-back-button" type="button" onClick={() => router.push("/student/exams")}>
          <ArrowLeft size={13} /> Back to scheduled examinations
        </button>
        {loading ? (
          <div role="status">
            <h2>Checking exam details…</h2>
          </div>
        ) : error && !data ? (
          <div className="notice warning" role="alert">{error}</div>
        ) : data && (
          <>
            <h2>Pay ₹20 to continue</h2>
            <p className="payment-instructions">{formatDisplayText(data.exam.title)}</p>
            <p className="payment-upi-instructions">Choose a payment method to continue.</p>
            <div className="payment-method-options" role="group" aria-label="Payment method">
              <button type="button" className="button button-secondary" disabled={busy} onClick={() => void submitPayment("cash", data.student.fullName, new Date())}>Cash / Offline</button>
              <button type="button" className={`button ${paymentMethod === "online" ? "button-primary" : "button-secondary"}`} onClick={() => { setPaymentMethod("online"); setOnlinePaymentDone(false); }}>Online Payment</button>
            </div>
            {paymentMethod === "online" && (
              <>
                <p className="payment-upi-instructions">Scan this QR code to pay ₹20.</p>
                <div className="exam-payment-qr-panel">
                  <a href={qr} target="_blank" rel="noreferrer" aria-label="Open the online payment QR code">
                    <img className="exam-payment-qr-image" src={qr} alt="Online payment QR code" />
                  </a>
                  <span>Scan to pay online</span>
                </div>
                {!onlinePaymentDone && (
                  <button type="button" className="button button-primary lookup-submit" onClick={() => setOnlinePaymentDone(true)}>
                    I have paid <ArrowRight size={15} />
                  </button>
                )}
              </>
            )}
            {error && <div className="notice warning" role="alert">{error}</div>}
            {data.payment?.status === "verified" || data.payment?.status === "pending" ? (
              <div className="exam-auth-notice payment-status-verified">
                <CheckCircle2 size={18} />
                <div>
                  <b>Payment confirmed</b>
                  <span>Direct exam access enabled. Opening questions...</span>
                  <button type="button" onClick={() => router.push(`/exam/${encodeURIComponent(examId)}`)}>
                    Open questions
                  </button>
                </div>
              </div>
            ) : paymentMethod === "online" && onlinePaymentDone ? (
              <form className="lookup-form payment-confirm-form" onSubmit={submitOnline}>
                <label htmlFor="exam-payer-name">Payer account name</label>
                <input
                  id="exam-payer-name"
                  value={payerName}
                  onChange={event => setPayerName(event.target.value)}
                  placeholder="Enter name shown on payment"
                  required
                  maxLength={120}
                />
                <label htmlFor="exam-paid-at">Payment date and time</label>
                <input
                  id="exam-paid-at"
                  type="datetime-local"
                  value={paidAt}
                  onChange={event => setPaidAt(event.target.value)}
                  required
                />
                <button className="button button-primary lookup-submit" disabled={busy || !payerName.trim() || !paidAt}>
                  {busy ? "Opening questions…" : "Submit payment details & open exam"}
                  <ArrowRight size={15} />
                </button>
              </form>
            ) : paymentMethod !== "online" ? <p className="exam-cash-instructions">Cash / Offline opens the exam directly. Choose Online Payment to scan the QR code.</p> : null}
          </>
        )}
        <footer className="lookup-footer">
          <span><ShieldCheck size={16} aria-hidden="true" /> Secure student payment</span>
        </footer>
      </section>
    </main>
  );
}
