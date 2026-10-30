"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { ExamPaymentReviewPanel } from "@/components/ExamPaymentReviewPanel";

export function TeacherPaymentsPage() {
  const router = useRouter();
  return <main className="dashboard-shell"><header className="topbar"><a className="brand" href="/teacher"><span className="brand-mark"><GraduationCap size={23}/></span><span><b>GLORIOUS</b><small>TEACHER PORTAL</small></span></a><button className="button button-secondary" onClick={() => router.push("/teacher")}><ArrowLeft size={14}/> Teacher dashboard</button></header><section className="dashboard-content student-action-page"><div className="section-heading"><div><span className="eyebrow">ATLAS PAYMENT RECORDS</span><h2>Exam payment verification</h2></div></div><ExamPaymentReviewPanel/></section></main>;
}
