"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
  const [changingPayment, setChangingPayment] = useState(false);
  const [onlinePaymentDone, setOnlinePaymentDone] = useState(false);
  const [onlineScannerOpen, setOnlineScannerOpen] = useState(false);
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
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
      setData(current => current ? {
        ...current,
        payment: {
          status: payload.status === "verified" ? "verified" : "pending",
          statusToken: String(payload.statusToken ?? ""),
          payerName: name,
          paidAt: paymentTime.toISOString(),
          method,
        },
      } : current);
      setPaymentMethod(null);
      setChangingPayment(false);
      setOnlinePaymentDone(false);
      setOnlineScannerOpen(false);
      setPaymentSuccessOpen(true);
      setBusy(false);
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
            <Image src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} unoptimized />
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
            <h2>{paymentMethod === "online" && onlinePaymentDone ? "Online Payment Details" : "Pay ₹20 to continue"}</h2>
            <p className="payment-instructions">{formatDisplayText(data.exam.title)}</p>
            {paymentMethod === null && data.payment && data.payment.status !== "rejected" && !changingPayment ? (
              <div className="exam-auth-notice payment-status-verified">
                <CheckCircle2 size={18} />
                <div>
                  <b>{data.payment.status === "verified" ? "Payment verified" : "Payment details submitted"}</b>
                  <span>{data.payment.method === "cash" ? "Cash / Offline" : "Online Payment"} · {data.payment.status === "pending" ? "awaiting staff verification" : "ready"}</span>
                  <button type="button" onClick={() => router.push(`/exam/${encodeURIComponent(examId)}`)}>Continue exam</button>
                  {data.payment.status === "pending" && <button type="button" onClick={() => setChangingPayment(true)}>Change payment method</button>}
                </div>
              </div>
            ) : paymentMethod === null && (
              <>
                {data.payment?.status === "rejected" && <div className="notice warning" role="alert">The previous payment submission was rejected. Choose a payment method and submit updated details.</div>}
                <p className="payment-upi-instructions">{changingPayment ? "Choose a payment method to update your pending details." : "Choose a payment method to continue."}</p>
                <div className="payment-method-options" role="group" aria-label="Payment method">
                  <button type="button" className="button payment-method-cash" disabled={busy} onClick={() => void submitPayment("cash", data.student.fullName, new Date())}>Cash / Offline</button>
                  <button type="button" className="button payment-method-online" disabled={busy} onClick={() => { setPaymentMethod("online"); setOnlinePaymentDone(false); setOnlineScannerOpen(true); }}>Online Payment</button>
                </div>
              </>
            )}
            {paymentMethod === "online" && onlineScannerOpen && (
              <div className="online-payment-modal-backdrop" role="presentation">
                <section className="online-payment-modal" role="dialog" aria-modal="true" aria-labelledby="online-payment-title">
                  <h3 id="online-payment-title">Online Payment</h3>
                  <p>Scan this QR code to pay ₹20.</p>
                  <div className="exam-payment-qr-panel">
                    <a href={qr} target="_blank" rel="noreferrer" aria-label="Open the online payment QR code">
                      <Image className="exam-payment-qr-image" src={qr} alt="Online payment QR code" width={220} height={220} unoptimized />
                    </a>
                    <span>Scan to pay online</span>
                  </div>
                  <button type="button" className="button button-primary" onClick={() => { setOnlinePaymentDone(true); setOnlineScannerOpen(false); }}>
                    I have paid <ArrowRight size={15} />
                  </button>
                  <button type="button" className="online-payment-back" onClick={() => { setPaymentMethod(null); setOnlineScannerOpen(false); }}>
                    Back to payment options
                  </button>
                </section>
              </div>
            )}
            {error && <div className="notice warning" role="alert">{error}</div>}
            {paymentMethod === "online" && onlinePaymentDone && (
              <section className="online-payment-details">
                <p className="payment-upi-instructions">Enter the payer name and payment time to continue to the exam.</p>
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
              </section>
            )}
          </>
        )}
        {paymentSuccessOpen && data?.payment && (
          <div className="modal-backdrop" style={{ zIndex: 1100 }}>
            <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="payment-success-title">
              <div style={{ textAlign: "center" }}>
                <CheckCircle2 size={38} color="#16a34a" aria-hidden="true" />
                <h2 id="payment-success-title" style={{ margin: "12px 0 6px" }}>Payment submitted successfully</h2>
                <p style={{ margin: 0, color: "#64748b" }}>
                  {data.payment.method === "cash" ? "Cash / Offline" : "Online Payment"} {data.payment.status === "verified" ? "payment is verified." : "details have been submitted. Staff will verify the payment."}
                </p>
              </div>
              <div style={{ marginTop: 20, padding: 12, border: "1px solid #bfdbfe", borderRadius: 10, background: "#eff6ff" }}>
                <button
                  type="button"
                  className="button button-primary lookup-submit"
                  style={{ margin: 0 }}
                  onClick={() => router.push(`/exam/${encodeURIComponent(examId)}`)}
                >
                  Continue exam <ArrowRight size={15} />
                </button>
              </div>
            </section>
          </div>
        )}
        <footer className="lookup-footer">
          <span><ShieldCheck size={16} aria-hidden="true" /> Secure student payment</span>
        </footer>
      </section>
    </main>
  );
}
