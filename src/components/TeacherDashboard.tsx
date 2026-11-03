"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  FileText,
  Radio,
  Users,
  LogOut,
  RefreshCw,
  Search,
  Download,
  BookOpen,
  Clock3,
  Pencil,
} from "lucide-react";
import { TeacherPaperQuestions } from "@/components/TeacherPaperQuestions";
import { TeacherAnswerKeyDownload } from "@/components/TeacherAnswerKeyDownload";
import { formatExamDateTime, getExamScheduleStatus } from "@/lib/format-exam-schedule";
import { formatDisplayText } from "@/lib/format-display";

type TeacherTab = "results" | "papers" | "sessions" | "students";

type TeacherResult = {
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

type MonitorViewer = { name: string; lastSeenAt: string };

function formatSessionCountdown(expiresAt: string, now: number) {
  const totalSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TeacherDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TeacherTab) || "results";
  const [tab, setTab] = useState<TeacherTab>(initialTab);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [teacherSessionReady, setTeacherSessionReady] = useState(false);
  const monitorViewerId = useRef("");

  // Results State
  const [results, setResults] = useState<TeacherResult[]>([]);
  const [classGroups, setClassGroups] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [resultSearch, setResultSearch] = useState("");
  const [resultsLoading, setResultsLoading] = useState(false);

  // Papers State
  const [papers, setPapers] = useState<PaperRow[]>([]);

  // Live Sessions State
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [sessionStats, setSessionStats] = useState({ active: 0, submitted: 0, total: 0 });
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [monitorViewers, setMonitorViewers] = useState<MonitorViewer[]>([]);
  const [monitorNow, setMonitorNow] = useState(() => Date.now());
  const [retryGrantingId, setRetryGrantingId] = useState("");

  // Students Roster State
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("all");

  const [globalMessage, setGlobalMessage] = useState("");
  const [globalError, setGlobalError] = useState("");

  useEffect(() => {
    const saved = searchParams.get("examSaved");
    if (!saved) return;
    setGlobalMessage(saved === "updated" ? "Exam updated successfully." : "Exam created and saved successfully.");
    router.replace("/teacher?tab=papers");
  }, [router, searchParams]);

  const switchTab = (nextTab: TeacherTab) => {
    setTab(nextTab);
    router.replace(`/teacher?tab=${nextTab}`);
  };

  // Load Teacher Session
  useEffect(() => {
    void fetch("/api/teacher/session", { cache: "no-store" })
      .then(async res => {
        if (!res.ok) {
          router.replace("/teacher/login");
          return;
        }
        const data = await res.json();
        if (data.teacherName) setTeacherName(data.teacherName);
        setTeacherSessionReady(true);
      })
      .catch(() => undefined);
  }, [router]);

  // Keep the teacher roster current across every dashboard tab, not only the live monitor.
  useEffect(() => {
    if (!teacherSessionReady) return;
    let active = true;
    const viewerId = monitorViewerId.current || (monitorViewerId.current = crypto.randomUUID());
    const refreshPresence = async () => {
      try {
        const response = await fetch("/api/teacher/monitor-presence", {
          method: "POST",
          headers: { "x-monitor-viewer-id": viewerId },
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json() as { viewers?: MonitorViewer[] };
        if (active) setMonitorViewers(data.viewers ?? []);
      } catch {
        // A later heartbeat will recover if the network is briefly unavailable.
      }
    };
    void refreshPresence();
    const heartbeat = window.setInterval(() => void refreshPresence(), 12000);
    return () => {
      active = false;
      window.clearInterval(heartbeat);
      void fetch("/api/teacher/monitor-presence", {
        method: "DELETE",
        headers: { "x-monitor-viewer-id": viewerId },
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [teacherSessionReady]);

  // Load Results
  const loadResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const res = await fetch("/api/teacher/results", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/teacher/login");
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

  // Load Papers
  const loadPapers = useCallback(async () => {
    try {
      const res = await fetch("/api/teacher/papers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load papers.");
      setPapers(data.papers || []);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading papers.");
    }
  }, []);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/teacher/sessions", { cache: "no-store" });
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
      const res = await fetch("/api/teacher/students", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load students.");
      setStudents(data.students || []);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error loading students.");
    }
  }, []);

  // Load each tab's data only when the user opens that tab.
  const loadedTabs = useRef(new Set<TeacherTab>());
  useEffect(() => {
    if (loadedTabs.current.has(tab)) return;
    loadedTabs.current.add(tab);
    if (tab === "results") void loadResults();
    if (tab === "papers") void loadPapers();
    if (tab === "students") void loadStudents();
  }, [tab, loadResults, loadPapers, loadSessions, loadStudents]);

  // Periodic refresh for live sessions
  useEffect(() => {
    if (tab !== "sessions") return;
    void loadSessions();
    const interval = window.setInterval(() => {
      void loadSessions();
    }, 12000);
    const clock = window.setInterval(() => setMonitorNow(Date.now()), 1000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clock);
    };
  }, [tab, loadSessions]);

  // Logout handler
  async function logout() {
    try {
      const viewerId = monitorViewerId.current;
      if (viewerId) {
        await fetch("/api/teacher/monitor-presence", {
          method: "DELETE",
          headers: { "x-monitor-viewer-id": viewerId },
        });
      }
      await fetch("/api/teacher/logout", { method: "POST" });
    } finally {
      router.replace("/teacher/login");
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

  const resultStats = {
    total: filteredResults.length,
    passed: filteredResults.filter(r => r.passed).length,
    passRate: filteredResults.length ? Math.round((filteredResults.filter(r => r.passed).length / filteredResults.length) * 100) : 0,
    avgScore: filteredResults.length
      ? (filteredResults.reduce((sum, r) => sum + r.percentage, 0) / filteredResults.length).toFixed(1)
      : "0",
    topScore: filteredResults.length ? Math.max(...filteredResults.map(r => r.marksObtained)) : 0,
  };

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

  const initials = teacherName
    .split(" ")
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "TC";

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar" aria-label="Teacher Navigation Sidebar">
        <div className="admin-sidebar-top">
          <a className="admin-brand" href="/teacher">
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
              <small>TEACHER PORTAL</small>
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
              <span>Student Roster</span>
              {students.length > 0 && <span className="admin-nav-badge">{students.length}</span>}
            </button>
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-profile-pill">
            <div className="admin-profile-avatar">{initials}</div>
            <div className="admin-profile-info">
              <b>{teacherName}</b>
              <small>Faculty Member</small>
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
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", marginBottom: 16, border: "1px solid #bfdbfe", borderRadius: 12, background: "#eff6ff", color: "#1e3a8a" }}>
          <Users size={18} style={{ flex: "0 0 auto", marginTop: 2 }} />
          <div>
            <b>Teachers logged in now ({monitorViewers.length})</b>
            <div style={{ marginTop: 3, fontSize: 14 }}>
              {monitorViewers.length ? monitorViewers.map(viewer => viewer.name).join(", ") : "Checking active teachers…"}
            </div>
          </div>
        </div>
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
                <p>Filter, search, and inspect student marks across Classes 8 through 12.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
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
                            <small>Roll: {item.rollNumber} · Code: {item.studentCode}</small>
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

        {/* TAB 2: EXAMS */}
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
                  onClick={() => router.push("/teacher/exams/new")}
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
                        <button className="button button-secondary compact-button" type="button" onClick={() => router.push(`/teacher/exams/${encodeURIComponent(paper.id)}`)}>
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

        {/* TAB 3: LIVE MONITOR / SESSIONS */}
        {tab === "sessions" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">REAL-TIME PROCTORING</span>
                <h1>Live Exam Sessions Monitor</h1>
                <p>Track active student exam attempts in real time across all classes.</p>
              </div>
              <button className="button button-secondary compact-button" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                <RefreshCw size={13} />
                <span>{sessionsLoading ? "Refreshing…" : "Refresh"}</span>
              </button>
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
                  <p>Auto-refreshes every 12 seconds. Teachers viewing now: {monitorViewers.length ? monitorViewers.map(viewer => viewer.name).join(", ") : "updating…"}</p>
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
                        <th>TIME LEFT</th>
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
                            {s.status === "in_progress" ? (
                              <b className={`session-countdown ${new Date(s.expiresAt).getTime() - monitorNow <= 60_000 ? "urgent" : ""}`}>
                                {formatSessionCountdown(s.expiresAt, monitorNow)}
                              </b>
                            ) : <small>—</small>}
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

        {/* TAB 4: STUDENT ROSTER */}
        {tab === "students" && (
          <section>
            <div className="admin-header">
              <div>
                <span className="eyebrow">ENROLLED STUDENT DIRECTORY</span>
                <h1>Student Roster & Class Cohorts</h1>
                <p>Inspect all registered students by class with their assigned roll numbers.</p>
              </div>
              <button className="button button-secondary compact-button" onClick={() => void loadStudents()}>
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
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
