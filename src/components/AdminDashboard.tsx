"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  CreditCard,
  FileText,
  Radio,
  Users,
  LogOut,
  RefreshCw,
  Search,
  Download,
  CheckCircle2,
  Clock3,
  BookOpen,
  Pencil,
  UserPlus,
} from "lucide-react";
import { TeacherPaperQuestions } from "@/components/TeacherPaperQuestions";
import { TeacherAnswerKeyDownload } from "@/components/TeacherAnswerKeyDownload";
import { formatDisplayText } from "@/lib/format-display";
import { formatExamDateTime, getExamScheduleStatus } from "@/lib/format-exam-schedule";

type AdminTab = "results" | "payments" | "papers" | "sessions" | "students" | "walkin";

type AdminResult = {
  id: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  studentCode: string;
  examId: string;
  examTitle: string;
  subject: string;
  chapterName: string;
  classSlug: string;
  className: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  passed: boolean;
  submittedAt: string;
  rank: number;
};

type PaymentRow = {
  id: string;
  studentName: string;
  rollNumber: string;
  board: string;
  groupName: string;
  subject: string;
  chapterName: string;
  amountInr: number;
  paymentMethod: "cash" | "online";
  transactionReference: string;
  payerUpiId: string;
  payerName: string;
  paidAt: string;
  status: "verified" | "pending" | "rejected";
  reviewedBy: string;
  createdAt: string;
};

type PaperRow = {
  id: string;
  title: string;
  subject: string;
  chapterName: string;
  academicSession: string;
  durationSeconds: number;
  maxMarks: number;
  passingMarks: number;
  published: boolean;
  startsAt: string | null;
  endsAt: string | null;
  questionCount: number;
  groups: { slug: string; name: string }[];
};

type LiveSessionRow = {
  id: string;
  studentName: string;
  rollNumber: string;
  className: string;
  examTitle: string;
  subject: string;
  status: string;
  warningCount: number;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
};

type StudentRow = {
  id: string;
  fullName: string;
  rollNumber: string;
  studentCode: string;
  classSlug: string;
  className: string;
  active: boolean;
};

type WalkInOptions = {
  groups: { id: string; slug: string; name: string }[];
  exams: { id: string; title: string; subject: string; groups: { id: string; slug: string; name: string }[] }[];
};

export function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as AdminTab) || "results";
  const [tab, setTab] = useState<AdminTab>(initialTab);

  // Results State
  const [results, setResults] = useState<AdminResult[]>([]);
  const [classGroups, setClassGroups] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [resultSearch, setResultSearch] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);

  // Payments State
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentStats, setPaymentStats] = useState({ total: 0, verified: 0, pending: 0, rejected: 0, totalAmountInr: 0 });
  const [paymentFilter, setPaymentFilter] = useState<"all" | "verified" | "pending" | "rejected">("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentActionBusy, setPaymentActionBusy] = useState<string>("");

  // Papers State
  const [papers, setPapers] = useState<PaperRow[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);

  // Live Sessions State
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [sessionStats, setSessionStats] = useState({ active: 0, submitted: 0, total: 0 });
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [retryGrantingId, setRetryGrantingId] = useState("");

  // Students Roster State
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("all");

  // Walk-in student exam state
  const [walkInOptions, setWalkInOptions] = useState<WalkInOptions>({ groups: [], exams: [] });
  const [walkInName, setWalkInName] = useState("");
  const [walkInRoll, setWalkInRoll] = useState("");
  const [walkInGroupId, setWalkInGroupId] = useState("");
  const [walkInExamId, setWalkInExamId] = useState("");
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);

  const [globalMessage, setGlobalMessage] = useState("");
  const [globalError, setGlobalError] = useState("");

  useEffect(() => {
    const saved = searchParams.get("examSaved");
    if (!saved) return;
    setGlobalMessage(saved === "updated" ? "Exam updated successfully." : "Exam created and saved successfully.");
    router.replace("/admin/dashboard?tab=papers");
  }, [router, searchParams]);

  // Sync tab with URL
  const switchTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    router.replace(`/admin/dashboard?tab=${nextTab}`);
  };

  // Load Results
  const loadResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const res = await fetch("/api/admin/results", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load results.");
      setResults(data.results || []);
      if (data.groups) setClassGroups(data.groups);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading results.");
    } finally {
      setResultsLoading(false);
    }
  }, [router]);

  // Load Payments
  const loadPayments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load payments.");
      setPayments(data.payments || []);
      if (data.stats) setPaymentStats(data.stats);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading payments.");
    }
  }, [router]);

  // Load Papers
  const loadPapers = useCallback(async () => {
    setPapersLoading(true);
    try {
      const res = await fetch("/api/admin/papers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load papers.");
      setPapers(data.papers || []);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading papers.");
    } finally {
      setPapersLoading(false);
    }
  }, []);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/admin/sessions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load live sessions.");
      setSessions(data.sessions || []);
      if (data.stats) setSessionStats(data.stats);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  async function grantAnotherAttempt(attemptId: string) {
    if (!window.confirm("Grant this student one more attempt? Their locked answers will be cleared when they start the retry.")) return;
    setRetryGrantingId(attemptId);
    setGlobalError("");
    setGlobalMessage("");
    try {
      const response = await fetch(`/api/exam-attempts/${encodeURIComponent(attemptId)}/grant`, { method: "POST" });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not grant another attempt.");
      setGlobalMessage(data.message || "Another exam attempt has been granted.");
      await loadSessions();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not grant another attempt.");
    } finally {
      setRetryGrantingId("");
    }
  }

  // Load Students
  const loadStudents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/students", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load students.");
      setStudents(data.students || []);
      if (data.groups) setClassGroups(data.groups);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading students.");
    }
  }, []);

  const loadWalkInOptions = useCallback(async () => {
    setWalkInLoading(true);
    try {
      const response = await fetch("/api/admin/walk-in-exam", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) throw new Error(data.error || "Could not load available examinations.");
      const options = data as WalkInOptions;
      setWalkInOptions(options);
      setWalkInGroupId(current => options.groups.some(group => group.id === current) ? current : "");
      setWalkInExamId(current => options.exams.some(exam => exam.id === current) ? current : "");
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not load available examinations.");
    } finally {
      setWalkInLoading(false);
    }
  }, [router]);

  async function startWalkInExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWalkInBusy(true);
    setGlobalError("");
    setGlobalMessage("");
    try {
      const response = await fetch("/api/admin/walk-in-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: walkInName, rollNumber: walkInRoll, groupId: walkInGroupId, examId: walkInExamId }),
      });
      const data = await response.json() as { error?: string; paymentUrl?: string };
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok || !data.paymentUrl) throw new Error(data.error || "Could not prepare this student.");
      window.location.assign(data.paymentUrl);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not prepare this student.");
      setWalkInBusy(false);
    }
  }

  // Load each tab's data only when the user opens that tab.
  const loadedTabs = useRef(new Set<AdminTab>());
  useEffect(() => {
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    if (tab === "results") void loadResults();
    if (tab === "payments") void loadPayments();
    if (tab === "papers") void loadPapers();
    if (tab === "sessions") void loadSessions();
    if (tab === "students") void loadStudents();
    if (tab === "walkin") void loadWalkInOptions();
  }, [tab, loadResults, loadPayments, loadPapers, loadSessions, loadStudents, loadWalkInOptions]);

  // Periodic refresh for live sessions if on sessions tab
  useEffect(() => {
    if (tab !== "sessions") return;
    const interval = window.setInterval(() => {
      void loadSessions();
    }, 12000);
    return () => window.clearInterval(interval);
  }, [tab, loadSessions]);

  // Logout handler
  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
    }
  }

  // Payment review action
  async function reviewPayment(paymentId: string) {
    setPaymentActionBusy(paymentId);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, approved: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update payment.");
      setGlobalMessage("Payment validated and marked verified.");
      await loadPayments();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Payment action failed.");
    } finally {
      setPaymentActionBusy("");
    }
  }

  // Filtered Results
  const filteredResults = results.filter(row => {
    const matchesClass = selectedClass === "all" || row.classSlug === selectedClass || row.className === selectedClass;
    const term = resultSearch.trim().toLowerCase();
    const matchesSearch =
      !term ||
      row.studentName.toLowerCase().includes(term) ||
      row.rollNumber.toLowerCase().includes(term) ||
      row.examTitle.toLowerCase().includes(term) ||
      row.subject.toLowerCase().includes(term);
    return matchesClass && matchesSearch;
  });

  // Calculate stats for current results view
  const resultStats = {
    total: filteredResults.length,
    passed: filteredResults.filter(r => r.passed).length,
    passRate: filteredResults.length ? Math.round((filteredResults.filter(r => r.passed).length / filteredResults.length) * 100) : 0,
    avgScore: filteredResults.length
      ? (filteredResults.reduce((sum, r) => sum + r.percentage, 0) / filteredResults.length).toFixed(1)
      : "0",
    topScore: filteredResults.length ? Math.max(...filteredResults.map(r => r.marksObtained)) : 0,
  };

  // Export Results to CSV
  function exportResultsCsv() {
    if (!filteredResults.length) return;
    const headers = ["Rank", "Student Name", "Roll Number", "Class", "Exam Title", "Subject", "Marks", "Max Marks", "Percentage", "Status", "Date Submitted"];
    const rows = filteredResults.map(r => [
      r.rank,
      `"${r.studentName}"`,
      r.rollNumber,
      `"${r.className}"`,
      `"${r.examTitle}"`,
      `"${r.subject}"`,
      r.marksObtained,
      r.maxMarks,
      `${r.percentage}%`,
      r.passed ? "Pass" : "Fail",
      `"${new Date(r.submittedAt).toLocaleString()}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gcc_results_${selectedClass}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Filtered Payments
  const filteredPayments = payments.filter(row => {
    const matchesStatus = paymentFilter === "all" || row.status === paymentFilter;
    const term = paymentSearch.trim().toLowerCase();
    const matchesSearch =
      !term ||
      row.studentName.toLowerCase().includes(term) ||
      row.payerName.toLowerCase().includes(term) ||
      row.rollNumber.toLowerCase().includes(term) ||
      row.subject.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });

  // Filtered Students
  const filteredStudents = students.filter(row => {
    const matchesClass = studentClassFilter === "all" || row.classSlug === studentClassFilter || row.className === studentClassFilter;
    const term = studentSearch.trim().toLowerCase();
    const matchesSearch =
      !term ||
      row.fullName.toLowerCase().includes(term) ||
      row.rollNumber.toLowerCase().includes(term) ||
      row.studentCode.toLowerCase().includes(term);
    return matchesClass && matchesSearch;
  });

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar" aria-label="Admin Navigation Sidebar">
        <div className="admin-sidebar-top">
          <a className="admin-brand" href="/admin/dashboard">
            <Image
              className="admin-brand-logo"
              src="https://gcc-result-out.onrender.com/static/logo.jpeg"
              alt="Glorious Coaching Centre Logo"
              width={38}
              height={38}
              unoptimized
            />
            <div>
              <b>GLORIOUS</b>
              <small>ADMIN PORTAL</small>
            </div>
          </a>

          <nav className="admin-sidebar-nav">
            <button
              className={`admin-nav-item ${tab === "results" ? "active" : ""}`}
              onClick={() => switchTab("results")}
            >
              <Award size={17} />
              <span>Results (Class-wise)</span>
              {results.length > 0 && <span className="admin-nav-badge">{results.length}</span>}
            </button>

            <button
              className={`admin-nav-item ${tab === "payments" ? "active" : ""}`}
              onClick={() => switchTab("payments")}
            >
              <CreditCard size={17} />
              <span>Payments</span>
              {paymentStats.pending > 0 && (
                <span className="admin-nav-badge" style={{ background: "#eab308" }}>
                  {paymentStats.pending}
                </span>
              )}
            </button>

            <button
              className={`admin-nav-item ${tab === "papers" ? "active" : ""}`}
              onClick={() => switchTab("papers")}
            >
              <FileText size={17} />
              <span>Exams</span>
              {papers.length > 0 && <span className="admin-nav-badge">{papers.length}</span>}
            </button>

            <button
              className={`admin-nav-item ${tab === "sessions" ? "active" : ""}`}
              onClick={() => switchTab("sessions")}
            >
              <Radio size={17} />
              <span>Live Exam Monitor</span>
              {sessionStats.active > 0 && (
                <span className="admin-nav-badge" style={{ background: "#22c55e" }}>
                  {sessionStats.active}
                </span>
              )}
            </button>

            <button
              className={`admin-nav-item ${tab === "students" ? "active" : ""}`}
              onClick={() => switchTab("students")}
            >
              <Users size={17} />
              <span>Student List</span>
              {students.length > 0 && <span className="admin-nav-badge">{students.length}</span>}
            </button>

            <button
              className={`admin-nav-item ${tab === "walkin" ? "active" : ""}`}
              onClick={() => switchTab("walkin")}
            >
              <UserPlus size={17} />
              <span>Add New Student to Examination</span>
            </button>
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-profile-pill">
            <div className="admin-profile-avatar">AD</div>
            <div className="admin-profile-info">
              <b>Mohammad Arif</b>
              <small>System Administrator</small>
            </div>
          </div>
          <button className="admin-logout-btn" onClick={logout}>
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        {globalError && (
          <div className="notice warning" role="alert" style={{ marginBottom: 16 }}>
            {globalError}
            <button
              style={{ marginLeft: "auto", border: 0, background: "none", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => setGlobalError("")}
            >
              ×
            </button>
          </div>
        )}

        {globalMessage && (
          <div className="notice success" role="status" style={{ marginBottom: 16 }}>
            {globalMessage}
            <button
              style={{ marginLeft: "auto", border: 0, background: "none", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => setGlobalMessage("")}
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: RESULTS (CLASS-WISE) */}
        {tab === "results" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">CLASS-WISE EXAMINATION RESULTS</span>
                <h1>Student Examination Results</h1>
              </div>
              <div className="admin-header-actions">
                <button className="button button-secondary compact-button" onClick={() => void loadResults()} disabled={resultsLoading}>
                  <RefreshCw size={13} />
                  <span>{resultsLoading ? "Refreshing…" : "Refresh"}</span>
                </button>
                <button
                  className="button button-primary compact-button"
                  onClick={exportResultsCsv}
                  disabled={!filteredResults.length}
                >
                  <Download size={13} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="admin-stats-grid">
              <article className="admin-stat-card">
                <span>Total Submissions</span>
                <b>{resultStats.total}</b>
                <small>Class: {selectedClass === "all" ? "All Classes" : selectedClass}</small>
              </article>
              <article className="admin-stat-card">
                <span>Pass Rate</span>
                <b>{resultStats.passRate}%</b>
                <small>{resultStats.passed} of {resultStats.total} passed</small>
              </article>
              <article className="admin-stat-card">
                <span>Average Percentage</span>
                <b>{resultStats.avgScore}%</b>
                <small>Average student mark</small>
              </article>
              <article className="admin-stat-card">
                <span>Highest Score</span>
                <b>{resultStats.topScore} pts</b>
                <small>Top mark in cohort</small>
              </article>
            </div>

            {/* Class Filter Pills */}
            <div className="class-filter-pills" role="tablist" aria-label="Class filters">
              <button
                className={`class-filter-pill ${selectedClass === "all" ? "active" : ""}`}
                onClick={() => setSelectedClass("all")}
              >
                All Classes (8–12)
              </button>
              {classGroups.map(group => (
                <button
                  key={group.slug}
                  className={`class-filter-pill ${selectedClass === group.slug || selectedClass === group.name ? "active" : ""}`}
                  onClick={() => setSelectedClass(group.slug)}
                >
                  {group.name}
                </button>
              ))}
            </div>

            {/* Results Table Panel */}
            <div className="results-panel">
              <div className="results-filter">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <Search size={14} style={{ color: "#8a96a8" }} />
                  <input
                    placeholder="Search student, roll number, or exam title…"
                    value={resultSearch}
                    onChange={e => setResultSearch(e.target.value)}
                    aria-label="Search results"
                  />
                </div>
                <span>{filteredResults.length} records found</span>
              </div>

              {filteredResults.length ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>RANK</th>
                        <th>STUDENT</th>
                        <th>CLASS</th>
                        <th>EXAMINATION</th>
                        <th>SCORE</th>
                        <th>PERCENTAGE</th>
                        <th>STATUS</th>
                        <th>SUBMITTED AT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span
                              className={`rank-badge ${
                                item.rank === 1
                                  ? "rank-badge-1"
                                  : item.rank === 2
                                  ? "rank-badge-2"
                                  : item.rank === 3
                                  ? "rank-badge-3"
                                  : "rank-badge-other"
                              }`}
                            >
                              #{item.rank}
                            </span>
                          </td>
                          <td>
                            <b>{item.studentName}</b>
                            <small>Roll: {item.rollNumber}</small>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: "#374b6c" }}>{item.className}</span>
                          </td>
                          <td>
                            <b>{formatDisplayText(item.examTitle)}</b>
                            <small>{item.subject} · {formatDisplayText(item.chapterName)}</small>
                          </td>
                          <td>
                            <b>{item.marksObtained} / {item.maxMarks}</b>
                            <small>{item.correctCount} correct · {item.incorrectCount} wrong</small>
                          </td>
                          <td>
                            <b style={{ color: item.percentage >= 60 ? "#2563eb" : "#4b5563" }}>
                              {item.percentage}%
                            </b>
                          </td>
                          <td>
                            <span className={`result-status ${item.passed ? "passed" : "failed"}`}>
                              {item.passed ? "Pass" : "Fail"}
                            </span>
                          </td>
                          <td>
                            <small>{new Date(item.submittedAt).toLocaleString()}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-exams">
                  <BookOpen size={18} />
                  <span>No results recorded for this selection yet.</span>
                </div>
              )}
            </div>

            {/* Answer Keys preview */}
            <div className="answer-key-panel" style={{ marginTop: 24 }}>
              <div className="results-toolbar">
                <div className="answer-key-heading">
                  <Image className="answer-key-logo" src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={42} height={42} unoptimized />
                  <div>
                  <h3>Answer Keys & Question Papers</h3>
                  <p>Download or print answer keys and question papers for verified exams.</p>
                  </div>
                </div>
              </div>
              <div className="answer-key-list">
                {papers.map(p => (
                  <article key={p.id}>
                    <div>
                      <b>{p.title}</b>
                      {(() => {
                        const title = p.title.toLocaleLowerCase();
                        const details = [p.groups.map(g => g.name).join(", "), p.subject, formatDisplayText(p.chapterName)]
                          .filter(value => value && !title.includes(value.toLocaleLowerCase()));
                        return details.length ? <small>{details.join(" · ")}</small> : null;
                      })()}
                    </div>
                    <TeacherAnswerKeyDownload
                      examId={p.id}
                      title={p.title}
                      subject={p.subject}
                      chapter={formatDisplayText(p.chapterName)}
                      className={p.groups.map(g => g.name).join(", ")}
                    />
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: PAYMENTS */}
        {tab === "payments" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">FEE COLLECTION & PHONEPE VERIFICATION</span>
                <h1>Student Exam Payments</h1>
                <p>Complete record of exam fee submissions, PhonePe payer names, and verification states.</p>
              </div>
              <div className="admin-header-actions">
                <button className="button button-secondary compact-button" onClick={() => void loadPayments()}>
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="admin-stats-grid">
              <article className="admin-stat-card">
                <span>Total Fee Collected</span>
                <b>₹{paymentStats.totalAmountInr}</b>
                <small>From verified payments</small>
              </article>
              <article className="admin-stat-card">
                <span>Verified Payments</span>
                <b style={{ color: "#16a34a" }}>{paymentStats.verified}</b>
                <small>Access enabled</small>
              </article>
              <article className="admin-stat-card">
                <span>Pending Review</span>
                <b style={{ color: "#ca8a04" }}>{paymentStats.pending}</b>
                <small>Waiting for confirmation</small>
              </article>
              <article className="admin-stat-card">
                <span>Rejected Submissions</span>
                <b style={{ color: "#dc2626" }}>{paymentStats.rejected}</b>
                <small>Declined</small>
              </article>
            </div>

            {/* Filter Tabs */}
            <div className="class-filter-pills">
              {(["all", "verified", "pending", "rejected"] as const).map(filter => (
                <button
                  key={filter}
                  className={`class-filter-pill ${paymentFilter === filter ? "active" : ""}`}
                  onClick={() => setPaymentFilter(filter)}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)} ({payments.filter(p => filter === "all" || p.status === filter).length})
                </button>
              ))}
            </div>

            {/* Payments Table */}
            <div className="results-panel">
              <div className="results-filter">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <Search size={14} style={{ color: "#8a96a8" }} />
                  <input
                    placeholder="Search student, PhonePe payer name, or roll number…"
                    value={paymentSearch}
                    onChange={e => setPaymentSearch(e.target.value)}
                    aria-label="Search payments"
                  />
                </div>
                <span>{filteredPayments.length} payments</span>
              </div>

              {filteredPayments.length ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>CLASS</th>
                        <th>EXAMINATION</th>
                        <th>PAYER / METHOD</th>
                        <th>AMOUNT</th>
                        <th>STATUS</th>
                        <th>PAID AT</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map(p => (
                        <tr key={p.id}>
                          <td>
                            <b>{p.studentName}</b>
                            <small>Roll: {p.rollNumber} · {p.board}</small>
                          </td>
                          <td>
                            <span>{p.groupName}</span>
                          </td>
                          <td>
                            <b>{p.subject}</b>
                            <small>{formatDisplayText(p.chapterName)}</small>
                          </td>
                          <td>
                            <b style={{ color: "#1e3a8a" }}>{p.payerName}</b>
                            <small>{p.paymentMethod === "cash" ? "Cash" : "Online · UPI"}</small>
                          </td>
                          <td>
                            <b>₹{p.amountInr}</b>
                          </td>
                          <td>
                            <span
                              className={`result-status ${
                                p.status === "verified"
                                  ? "passed"
                                  : p.status === "pending"
                                  ? "pending"
                                  : "failed"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <small>{new Date(p.paidAt).toLocaleString()}</small>
                          </td>
                          <td>
                            {p.status === "pending" ? (
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  className="button button-primary"
                                  style={{ height: 28, padding: "0 8px", fontSize: 10 }}
                                  disabled={paymentActionBusy === p.id}
                                  onClick={() => void reviewPayment(p.id)}
                                >
                                  <CheckCircle2 size={12} /> Validate
                                </button>
                              </div>
                            ) : (
                              <small style={{ color: "#94a3b8" }}>{p.reviewedBy ? `by ${p.reviewedBy}` : "auto-verified"}</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-exams">
                  <CreditCard size={18} />
                  <span>No payment records match this filter.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: EXAMS */}
        {tab === "papers" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">EXAM MANAGEMENT</span>
                <h1>Exams</h1>
                <p>Create exams, set their start time, and manage class access.</p>
              </div>
              <div className="admin-header-actions">
                <button
                  className="button button-primary compact-button"
                  onClick={() => router.push("/admin/exams/new")}
                >
                  <FileText size={13} />
                  <span>+ Create Exam</span>
                </button>
                <button className="button button-secondary compact-button" onClick={() => void loadPapers()}>
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Exams List */}
            <div className="paper-list">
              <div className="results-toolbar">
                <div>
                  <h3>Scheduled Exams</h3>
                  <p>Exam dates, access windows, and class assignments.</p>
                </div>
                <span>{papers.length} exams</span>
              </div>

              {papers.length ? (
                papers.map(paper => {
                  const scheduleStatus = getExamScheduleStatus(paper.published, paper.startsAt, paper.endsAt);
                  return <div className="paper-list-item" key={paper.id}>
                    <article className="paper-row">
                      <div>
                        <span className={`result-status ${scheduleStatus.className}`}>
                          {scheduleStatus.label}
                        </span>
                        <h4>{formatDisplayText(paper.title)}</h4>
                        <p>{paper.subject} · {formatDisplayText(paper.chapterName)}</p>
                        <small>
                          Classes: {paper.groups.map(g => g.name).join(" + ") || "All"} · {paper.maxMarks} marks ·{" "}
                          {paper.questionCount} questions · {Math.round(paper.durationSeconds / 60)} minutes
                        </small>
                        <small className="paper-schedule-detail">
                          Starts: {formatExamDateTime(paper.startsAt)} · Access closes: {formatExamDateTime(paper.endsAt)}
                        </small>
                      </div>
                      <div className="paper-result-status">
                        <span>Passing: {paper.passingMarks} marks</span>
                        <button className="button button-secondary compact-button" type="button" onClick={() => router.push(`/admin/exams/${encodeURIComponent(paper.id)}`)}>
                          <Pencil size={13} /> Edit
                        </button>
                      </div>
                    </article>
                    <TeacherPaperQuestions examId={paper.id} />
                  </div>;
                })
              ) : (
                <div className="empty-exams">
                  <BookOpen size={18} />
                  <span>No exams have been created yet.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: LIVE MONITOR / SESSIONS */}
        {tab === "sessions" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">REAL-TIME PROCTORING</span>
                <h1>Live Exam Sessions Monitor</h1>
                <p>Track active student exam attempts in real time across all classes.</p>
              </div>
              <div className="admin-header-actions">
                <button className="button button-secondary compact-button" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                  <RefreshCw size={13} />
                  <span>{sessionsLoading ? "Refreshing…" : "Refresh"}</span>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="admin-stats-grid">
              <article className="admin-stat-card">
                <span>Active Exam In-Progress</span>
                <b style={{ color: "#2563eb" }}>{sessionStats.active}</b>
                <small>Currently writing answers</small>
              </article>
              <article className="admin-stat-card">
                <span>Completed / Submitted</span>
                <b style={{ color: "#16a34a" }}>{sessionStats.submitted}</b>
                <small>Exam attempts finalized</small>
              </article>
              <article className="admin-stat-card">
                <span>Total Exam Attempts</span>
                <b>{sessionStats.total}</b>
                <small>All student sessions</small>
              </article>
            </div>

            {/* Sessions Table */}
            <div className="proctor-panel">
              <div className="results-toolbar">
                <div>
                  <h3>Active & Recent Student Sessions</h3>
                  <p>Auto-refreshes every 12 seconds with Atlas runtime status.</p>
                </div>
                <span>{sessions.length} sessions</span>
              </div>

              {sessions.length ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>CLASS</th>
                        <th>EXAMINATION</th>
                        <th>STATUS</th>
                        <th>WARNINGS</th>
                        <th>STARTED AT</th>
                        <th>EXPIRES AT</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.id}>
                          <td>
                            <b>{s.studentName}</b>
                            <small>Roll: {s.rollNumber}</small>
                          </td>
                          <td>
                            <span>{s.className}</span>
                          </td>
                          <td>
                            <b>{formatDisplayText(s.examTitle)}</b>
                            <small>{s.subject}</small>
                          </td>
                          <td>
                            <span
                              className={`result-status ${
                                s.status === "in_progress"
                                  ? "pending"
                                  : s.status === "submitted" || s.status === "retry_allowed"
                                  ? "passed"
                                  : "failed"
                              }`}
                            >
                              {s.status.replace("_", " ")}
                            </span>
                          </td>
                          <td>
                            <b style={{ color: s.warningCount > 0 ? "#dc2626" : "#64748b" }}>
                              {s.warningCount}
                            </b>
                          </td>
                          <td>
                            <small>{new Date(s.startedAt).toLocaleTimeString()}</small>
                          </td>
                          <td>
                            <small>{new Date(s.expiresAt).toLocaleTimeString()}</small>
                          </td>
                          <td>
                            {s.status === "locked" && (
                              <button
                                className="button button-secondary compact-button"
                                type="button"
                                onClick={() => void grantAnotherAttempt(s.id)}
                                disabled={Boolean(retryGrantingId)}
                              >
                                {retryGrantingId === s.id ? "Granting…" : "Grant reattempt"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-exams">
                  <Clock3 size={18} />
                  <span>No student examination sessions found.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "walkin" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">ADD NEW STUDENT TO EXAMINATION</span>
                <h1>Add New Student to Examination</h1>
                <p>Enter the student details, class and an exam that is open now.</p>
              </div>
              <div className="admin-header-actions">
                <button className="button button-secondary compact-button" type="button" onClick={() => void loadWalkInOptions()} disabled={walkInLoading}>
                  <RefreshCw size={13} />
                  <span>{walkInLoading ? "Refreshing…" : "Refresh exams"}</span>
                </button>
              </div>
            </div>

            <form className="walk-in-exam-form" onSubmit={startWalkInExam}>
              <div className="paper-fields">
                <div>
                  <label htmlFor="walk-in-student-name">Student name</label>
                  <input id="walk-in-student-name" value={walkInName} onChange={event => setWalkInName(event.target.value)} maxLength={120} required placeholder="Enter full name" />
                </div>
                <div>
                  <label htmlFor="walk-in-roll-number">Roll number</label>
                  <input id="walk-in-roll-number" value={walkInRoll} onChange={event => setWalkInRoll(event.target.value)} maxLength={32} required placeholder="Enter roll number" />
                </div>
                <div>
                  <label htmlFor="walk-in-class">Class</label>
                  <select id="walk-in-class" value={walkInGroupId} required onChange={event => { setWalkInGroupId(event.target.value); setWalkInExamId(""); }} disabled={walkInLoading || !walkInOptions.groups.length}>
                    <option value="">Select class</option>
                    {walkInOptions.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="walk-in-exam">Open examination</label>
                  <select id="walk-in-exam" value={walkInExamId} required onChange={event => setWalkInExamId(event.target.value)} disabled={!walkInGroupId || walkInLoading}>
                    <option value="">Select examination</option>
                    {walkInOptions.exams.filter(exam => exam.groups.some(group => group.id === walkInGroupId)).map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.subject}</option>)}
                  </select>
                </div>
              </div>
              <p className="walk-in-exam-note">This creates a student record in the selected class and opens the normal payment step. The student can then continue to the exam.</p>
              <button className="button button-primary" type="submit" disabled={walkInBusy || walkInLoading || !walkInOptions.exams.length}>
                <UserPlus size={15} />
                {walkInBusy ? "Preparing student…" : "Continue to payment & exam"}
              </button>
              {!walkInLoading && !walkInOptions.exams.length && <div className="empty-exams"><Clock3 size={17} /><span>There are no published exams open right now.</span></div>}
            </form>
          </section>
        )}

        {/* TAB 5: STUDENT ROSTER */}
        {tab === "students" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">ENROLLED STUDENT DIRECTORY</span>
                <h1>Student List & Class Cohorts</h1>
                <p>Inspect all registered students by class with their assigned roll numbers.</p>
              </div>
              <div className="admin-header-actions">
                <button className="button button-secondary compact-button" onClick={() => void loadStudents()}>
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Class Filter Pills */}
            <div className="class-filter-pills">
              <button
                className={`class-filter-pill ${studentClassFilter === "all" ? "active" : ""}`}
                onClick={() => setStudentClassFilter("all")}
              >
                All Classes ({students.length})
              </button>
              {classGroups.map(group => (
                <button
                  key={group.slug}
                  className={`class-filter-pill ${
                    studentClassFilter === group.slug || studentClassFilter === group.name ? "active" : ""
                  }`}
                  onClick={() => setStudentClassFilter(group.slug)}
                >
                  {group.name} ({students.filter(s => s.classSlug === group.slug || s.className === group.name).length})
                </button>
              ))}
            </div>

            {/* Students Table */}
            <div className="results-panel">
              <div className="results-filter">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <Search size={14} style={{ color: "#8a96a8" }} />
                  <input
                    placeholder="Search student name, roll number, or code…"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    aria-label="Search student roster"
                  />
                </div>
                <span>{filteredStudents.length} students</span>
              </div>

              {filteredStudents.length ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>ROLL</th>
                        <th>STUDENT NAME</th>
                        <th>CLASS</th>
                        <th>STUDENT CODE</th>
                        <th>ACCOUNT STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(student => (
                        <tr key={student.id}>
                          <td>
                            <b style={{ color: "#2563eb" }}>#{student.rollNumber}</b>
                          </td>
                          <td>
                            <b>{student.fullName}</b>
                          </td>
                          <td>
                            <span>{student.className}</span>
                          </td>
                          <td>
                            <code>{student.studentCode}</code>
                          </td>
                          <td>
                            <span className="result-status passed">Active</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-exams">
                  <Users size={18} />
                  <span>No students found matching this criteria.</span>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
