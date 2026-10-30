"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";

type Payment = { id: string; student_name: string; roll_number: string; board: string; group_name: string; subject: string; chapter_name: string; amount_inr: number; transaction_reference: string; payer_upi_id: string; payer_name: string; paid_at: string; status: "pending"|"verified"|"rejected"; created_at: string };

export function ExamPaymentReviewPanel() {
  const [rows,setRows]=useState<Payment[]>([]);
  const [message,setMessage]=useState("");
  const [busyId,setBusyId]=useState("");
  const [loadError,setLoadError]=useState("");
  const pendingCount=rows.filter(row=>row.status==="pending").length;

  const load=useCallback(async()=>{
    try {
      const response=await fetch("/api/teacher/payments",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Could not load payment submissions.");
      setRows(Array.isArray(data.payments)?data.payments as Payment[]:[]);
      setLoadError("");
    } catch(error) { setLoadError(error instanceof Error?error.message:"Could not load payment submissions."); }
  },[]);

  useEffect(()=>{void load()},[load]);

  async function review(row:Payment,approved:boolean){
    setBusyId(row.id);setMessage("");
    try{
      const response=await fetch(`/api/teacher/payments/${encodeURIComponent(row.id)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({approved})});
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.error||"Could not save the payment decision.");
      setMessage(approved?`Payment marked verified for ${row.student_name}.`: `Payment rejected for ${row.student_name}.`);
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save the payment decision.");}
    finally{setBusyId("");}
  }

  return <section className="payment-review-panel">
    <div className="results-toolbar"><div><h3>Exam payment verification <span className="payment-pending-count">{pendingCount} pending</span></h3><p>Check the payer name and payment time against the PhonePe account. Approval here does not bypass student exam authorization.</p></div><button className="button button-secondary" onClick={()=>void load()}>Refresh</button></div>
    {loadError&&<div className="notice warning admission-notice">{loadError}</div>}
    {message&&<div className="notice success admission-notice" role="status">{message}</div>}
    {rows.filter(row=>row.status==="pending").length===0?<div className="empty-exams"><Clock3 size={17}/><span>No pending exam payment submissions.</span></div>:rows.filter(row=>row.status==="pending").map(row=><article className="payment-review-row" key={row.id}>
      <div className="payment-review-data"><span className="result-status pending">Pending · ₹{row.amount_inr}</span><h4>{row.student_name} <small>Roll {row.roll_number} · {row.group_name} · {row.board}</small></h4><p>{row.subject} · {formatDisplayText(row.chapter_name)}</p><dl><div><dt>PhonePe name</dt><dd>{row.payer_name}</dd></div><div><dt>Paid at</dt><dd>{new Date(row.paid_at).toLocaleString()}</dd></div></dl></div>
  <div className="admission-actions"><button className="button button-secondary" disabled={busyId===row.id} onClick={()=>void review(row,false)}><XCircle size={13}/> Reject</button><button className="button button-primary" disabled={busyId===row.id} onClick={()=>void review(row,true)}><CheckCircle2 size={13}/> Verify payment</button></div>
    </article>)}
  </section>;
}
