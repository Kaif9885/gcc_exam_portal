"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, LockKeyhole, Mail, ShieldCheck, Sparkles, Users, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PaperBuilder } from "@/components/PaperBuilder";
import { StudentExamGate } from "@/components/StudentExamGate";
import { formatOptionLabel, MathText } from "@/components/MathText";
import { ExamPaymentReviewPanel } from "@/components/ExamPaymentReviewPanel";
import { TeacherLoginGate, type TeacherLoginDetails } from "@/components/TeacherLoginGate";
import { TeacherLiveProctor } from "@/components/TeacherLiveProctor";
import { TeacherPaperQuestions } from "@/components/TeacherPaperQuestions";
import { TeacherAnswerKeyDownload } from "@/components/TeacherAnswerKeyDownload";
import { formatDisplayText } from "@/lib/format-display";

type Profile = { full_name: string; role: "student" | "teacher" | "admin" };
type Exam = { id: string; title: string; subject: string; academic_session: string; duration_seconds: number; status: string; results_published: boolean; marks_obtained?: number; max_marks?: number; percentage?: number; passed?: boolean };
type ExamQuestion = { id: string; body: string; image_url: string | null; position: number; marks: number; options: { id: string; label: string; body: string }[]; answer: string | null; marked_for_review: boolean };
type ActiveExam = { attempt_id: string; exam_id: string; session_token: string; expires_at: string; duration_seconds: number; warning_count: number; title: string; subject: string; questions: ExamQuestion[] };
type TeacherResult = { exam_id: string; attempt_id: string; exam_title: string; subject: string; chapter_name?: string; academic_session: string; exam_group_id: string; group_name: string; full_name: string; roll_number: string; student_code: string; section: string | null; correct_count: number; incorrect_count: number; unanswered_count: number; marks_obtained: number; max_marks: number; percentage: number; passed: boolean; submitted_at: string; rank: number };
type StudentIdentity = { id: string; roll_number: string; student_code: string; section: string | null; group_name: string; group_slug: string; board: string };
type StudentRegistrationStatus = { payment_status: string; review_status: string; requested_group_id: string; subject: string; chapter_name: string };
type TeacherPaper = { id: string; title: string; subject: string; chapter_name: string; academic_session: string; max_marks: number; passing_marks: number; duration_seconds: number; published: boolean; results_published: boolean; groups: { slug: string; name: string }[] };
type TeacherScope = { groupSlug: string; subject: string; chapter: string };

const groups = ["Class 8", "Class 9", "Class 10 Boys", "Class 10 Girls", "Class 11", "Class 12"];
const groupsBySlug: Record<string, string> = { "class-8": "Class 8", "class-9": "Class 9", "class-10-boys": "Class 10 Boys", "class-10-girls": "Class 10 Girls", "class-11": "Class 11", "class-12": "Class 12" };
const instructions = ["Verify your name, roll number and class before beginning.", "Stay on the examination screen; detected tab or focus changes are recorded.", "You get two warnings. The third detected departure signs you out and ends your exam access.", "Answers save automatically when the connection is available.", "The exam submits automatically when the countdown reaches zero.", "Submitted answers cannot be changed. Contact an authorized teacher for help."];

export function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [accept, setAccept] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "recover">("sign-in");
  const [showLogin, setShowLogin] = useState(pathname === "/auth/login");
  const [showTeacherLogin, setShowTeacherLogin] = useState(pathname === "/teacher/login");
  const [configured, setConfigured] = useState(true);
  const [localTeacherMode, setLocalTeacherMode] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [teacherResults, setTeacherResults] = useState<TeacherResult[]>([]);
  const [teacherPapers, setTeacherPapers] = useState<TeacherPaper[]>([]);
  const [teacherTab, setTeacherTab] = useState<"results" | "papers" | "payments" | "live">("results");
  const [teacherScope, setTeacherScope] = useState<TeacherScope | null>(null);
  const [studentIdentity, setStudentIdentity] = useState<StudentIdentity | null>(null);
  const [studentRegistrationStatus, setStudentRegistrationStatus] = useState<StudentRegistrationStatus | null>(null);
  const [resultSearch, setResultSearch] = useState("");
  const [selectedTeacherClass, setSelectedTeacherClass] = useState("all");
  const [teacherResultSubject, setTeacherResultSubject] = useState("");
  const [teacherResultChapter, setTeacherResultChapter] = useState("");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [questionTimesLeft, setQuestionTimesLeft] = useState<Record<number, number> | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [focusWarningCount, setFocusWarningCount] = useState<number | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [resultPending, setResultPending] = useState(false);
  const [resultRestored, setResultRestored] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [saveState, setSaveState] = useState("All changes saved");
  const submitting = useRef(false);
  const pendingSaves = useRef(new Map<string, { questionId: string; optionId: string | null; marked: boolean }>());

  const goTo = useCallback((path: string, replace = false) => {
    if (replace) router.replace(path);
    else router.push(path);
  }, [router]);

  useEffect(() => {
    setShowLogin(pathname === "/auth/login");
    setShowTeacherLogin(pathname === "/teacher/login");
    const tabByPath: Record<string, typeof teacherTab> = {
      "/teacher/results": "results", "/teacher/papers": "papers", "/teacher/sessions": "live", "/admin/payments": "payments",
    };
    if (tabByPath[pathname]) setTeacherTab(tabByPath[pathname]);
    if (pathname === "/" || pathname === "/auth/login" || pathname === "/auth/callback" || pathname === "/teacher/login" || pathname.startsWith("/registration/") || pathname === "/student" || pathname === "/studentdashboard" || pathname.startsWith("/student/payment/") || pathname === "/student/result" || pathname.startsWith("/exam/") || Object.hasOwn(tabByPath, pathname)) return;
    if (!profile) goTo("/", true);
  }, [pathname, profile, goTo]);

  useEffect(() => {
    if (!profile || authLoading) return;
    if (pathname === "/student/result" && !resultRestored) return;
    if (activeExam) {
      const examPath = `/exam/${activeExam.exam_id}`;
      if (pathname !== examPath) goTo(examPath, true);
      return;
    }
    if (result) {
      if (pathname !== "/student/result") goTo("/student/result", true);
      return;
    }
    if (profile.role === "student") {
      if (pathname !== "/studentdashboard") goTo("/studentdashboard", true);
      return;
    }
    if (!["/teacher/results", "/teacher/papers", "/teacher/sessions", "/admin/payments"].includes(pathname)) {
      const defaultPath = teacherTab === "papers" ? "/teacher/papers" : teacherTab === "live" ? "/teacher/sessions" : teacherTab === "payments" ? "/admin/payments" : "/teacher/results";
      goTo(defaultPath, true);
    }
  }, [profile, authLoading, activeExam?.exam_id, result, resultRestored, pathname, teacherTab, goTo]);

  useEffect(() => {
    if (pathname !== "/student/result") { setResultRestored(false); return; }
    try {
      const saved = sessionStorage.getItem("ghs_latest_exam_result");
      if (saved && !result) {
        const restored = JSON.parse(saved) as Record<string, unknown>;
        setResult(restored);
        setResultPending(restored.result_published === false);
      }
    } catch { sessionStorage.removeItem("ghs_latest_exam_result"); }
    setResultRestored(true);
  }, [pathname, result]);

  useEffect(() => {
    let active = true;
    const loadLocalTeacher = async () => {
      try {
        const response = await fetch("/api/teacher/session", { cache: "no-store" });
        if (!response.ok) return false;
        const session = await response.json();
        if (!active || !session.teacherName) return false;
        setProfile({ full_name: session.teacherName, role: "teacher" });
        setLocalTeacherMode(true);
        if (session.mode === "questions") {
          const savedScope = sessionStorage.getItem("teacherExamScope");
          if (savedScope) { try { setTeacherScope(JSON.parse(savedScope) as TeacherScope); } catch { sessionStorage.removeItem("teacherExamScope"); setTeacherScope(null); } }
          else setTeacherScope(null);
        } else if (session.mode === "results") {
          const savedResultScope = sessionStorage.getItem("teacherResultScope");
          if (savedResultScope) {
            try {
              const scope = JSON.parse(savedResultScope) as { groupName: string; subject: string; chapter: string };
              setSelectedTeacherClass(scope.groupName);
              setTeacherResultSubject(scope.subject);
              setTeacherResultChapter(scope.chapter);
            } catch { sessionStorage.removeItem("teacherResultScope"); }
          }
          setTeacherScope(null);
          sessionStorage.removeItem("teacherExamScope");
        } else {
          setTeacherScope(null);
          sessionStorage.removeItem("teacherExamScope");
          sessionStorage.removeItem("teacherResultScope");
        }
        setTeacherTab(session.mode === "questions" ? "papers" : session.mode === "results" ? "results" : "live");
        return true;
      } catch { return false; }
    };
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
        if (!active) return;
        if (!data.user) { await loadLocalTeacher(); return; }
        setUserEmail(data.user.email ?? "");
        const { data: row, error } = await supabase.from("profiles").select("full_name, role").eq("id", data.user.id).maybeSingle();
        if (active && !error && row) {
          if (row.role === "student") {
            const { data: allowed } = await supabase.rpc("is_authorized_student_login");
            if (!allowed) {
              await supabase.auth.signOut();
              if (active) setNotice("Student sign-in is limited to the school's authorized name and roll-number roster.");
              return;
            }
          } else if (row.role === "teacher") {
            const { data: allowed } = await supabase.rpc("is_authorized_teacher_login", { p_full_name: row.full_name });
            if (!allowed) {
              await supabase.auth.signOut();
              if (active) setNotice("This teacher account is not on the school's authorized teacher list.");
              return;
            }
          }
          setProfile(row as Profile);
          if (row.role === "student") {
            const { data: registration } = await supabase.from("registration_requests").select("payment_status,review_status,requested_group_id,subject,chapter_name").eq("profile_id", data.user.id).maybeSingle();
            if (active && registration) setStudentRegistrationStatus(registration as StudentRegistrationStatus);
            const { data: student } = await supabase.from("students").select("id,roll_number,student_code,section,exam_group_id,board").eq("profile_id", data.user.id).maybeSingle();
            if (active && student) {
              const { data: group } = await supabase.from("exam_groups").select("name,slug").eq("id", student.exam_group_id).maybeSingle();
              if (active) setStudentIdentity({ id:student.id,roll_number: student.roll_number, student_code: student.student_code, section: student.section, group_name: group?.name ?? "Assigned class", group_slug: group?.slug ?? "", board: student.board });
            }
            const { data: assigned } = await supabase.rpc("get_my_exams");
            if (active && Array.isArray(assigned)) {
              const { data: publishedResults } = await supabase.from("results").select("exam_id,marks_obtained,max_marks,percentage,passed").order("submitted_at", { ascending: false });
              const resultsByExam = new Map((publishedResults ?? []).map(item => [item.exam_id, item]));
              const assignedExams = (assigned as Exam[]).map(item => ({ ...item, ...resultsByExam.get(item.id) }));
              setExams(assignedExams);
              const inProgress = assignedExams.find(exam => exam.status === "in_progress");
              if (inProgress) {
                const { data: resumed, error: resumeError } = await supabase.rpc("resume_exam", { p_exam_id: inProgress.id });
                if (active && !resumeError && resumed) {
                  const restored = resumed as ActiveExam;
                  const storedState = sessionStorage.getItem("ghs_active_exam_ui");
                  let savedIndex = 0;
                  let savedQuestionTimes: Record<number, number> | null = null;
                  if (storedState) {
                    try {
                      const saved = JSON.parse(storedState) as { examId?: string; questionIndex?: number; questionTimesLeft?: Record<string, number> | null };
                      if (saved.examId === inProgress.id) {
                        savedIndex = Math.min(Math.max(0, Number(saved.questionIndex) || 0), Math.max(0, restored.questions.length - 1));
                        savedQuestionTimes = saved.questionTimesLeft ? Object.fromEntries(Object.entries(saved.questionTimesLeft).map(([index, seconds]) => [Number(index), Math.max(0, Number(seconds) || 0)])) : null;
                      }
                    } catch { sessionStorage.removeItem("ghs_active_exam_ui"); }
                  }
                  setActiveExam({ ...restored, exam_id: inProgress.id });
                  setCurrentQuestion(savedIndex);
                  setQuestionTimesLeft(savedQuestionTimes ?? (restored.duration_seconds === 2700 && restored.questions.length === 60
                    ? Object.fromEntries(restored.questions.map((_, index) => [index, 45]))
                    : null));
                  setWarningCount(Number(restored.warning_count || 0));
                  setSecondsLeft(Math.max(0, Math.floor((new Date(restored.expires_at).getTime() - Date.now()) / 1000)));
                }
              }
            }
          } else if (row.role === "teacher" || row.role === "admin") {
            const savedScope=sessionStorage.getItem("teacherExamScope");
            if(savedScope){try{setTeacherScope(JSON.parse(savedScope) as TeacherScope);setTeacherTab("papers");}catch{sessionStorage.removeItem("teacherExamScope");}}
            const { data: records } = await supabase.rpc("get_teacher_results");
            if (active && Array.isArray(records)) setTeacherResults(records as TeacherResult[]);
            const { data: papers } = await supabase.rpc("get_teacher_papers");
            if (active && Array.isArray(papers)) setTeacherPapers(papers as TeacherPaper[]);
          }
        } else { await loadLocalTeacher(); }
      }).catch(async () => { setConfigured(false); await loadLocalTeacher(); }).finally(() => { if (active) setAuthLoading(false); });
    } catch { setConfigured(false); void loadLocalTeacher().finally(() => { if (active) setAuthLoading(false); }); }
    return () => { active = false; };
  }, []);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const supabase = createClient();
      if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` });
        if (error) throw error;
        setNotice("If an account exists for this address, password reset instructions have been sent.");
      } else {
        const { data: signedIn, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: row } = await supabase.from("profiles").select("full_name,role").eq("id", signedIn.user.id).maybeSingle();
        let allowed = row?.role === "admin";
        if (row?.role === "student") {
          const { data } = await supabase.rpc("is_authorized_student_login");
          allowed = data === true;
        } else if (row?.role === "teacher") {
          const { data } = await supabase.rpc("is_authorized_teacher_login", { p_full_name: row.full_name });
          allowed = data === true;
        }
        if (!allowed) {
          await supabase.auth.signOut();
          throw new Error("Your student name/roll number or teacher account is not on the authorized school list.");
        }
        location.reload();
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }

  async function authenticateTeacher(details: TeacherLoginDetails): Promise<string | null> {
    try {
      const response=await fetch("/api/teacher/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(details)});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error??"Teacher login failed.");
      if (details.mode === "questions" && details.groupSlug && details.subject && details.chapter) {
        sessionStorage.setItem("teacherExamScope",JSON.stringify({groupSlug:details.groupSlug,subject:details.subject,chapter:details.chapter}));
      } else sessionStorage.removeItem("teacherExamScope");
      if (details.mode === "results" && details.groupSlug && details.subject && details.chapter) {
        sessionStorage.setItem("teacherResultScope",JSON.stringify({groupName:groupsBySlug[details.groupSlug] ?? details.groupSlug,subject:details.subject,chapter:details.chapter}));
      } else sessionStorage.removeItem("teacherResultScope");
      window.location.assign(details.mode === "questions" ? "/teacher/papers" : details.mode === "results" ? "/teacher/results" : "/teacher/sessions");
      return null;
    } catch(error) { return error instanceof Error?error.message:"Teacher login failed."; }
  }

  async function signOut() {
    sessionStorage.removeItem("ghs_active_exam_ui");
    sessionStorage.removeItem("ghs_latest_exam_result");
    await fetch("/api/teacher/logout", { method: "POST" }).catch(() => undefined);
    try { const supabase = createClient(); await supabase.auth.signOut(); } catch { /* Local teacher mode has no Supabase Auth session. */ }
    location.reload();
  }

  function exportResults() {
    const header = ["Exam", "Subject", "Group", "Student", "Roll", "Student ID", "Correct", "Incorrect", "Unanswered", "Marks", "Maximum", "Percentage", "Pass", "Rank", "Submitted"];
    const rows = visibleResults.map(row => [row.exam_title,row.subject,row.group_name,row.full_name,row.roll_number,row.student_code,row.correct_count,row.incorrect_count,row.unanswered_count,row.marks_obtained,row.max_marks,row.percentage,row.passed?"Pass":"Fail",row.rank,row.submitted_at]);
    const csv = [header,...rows].map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); link.download = "school-examination-results.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  const scopedResults = teacherResults.filter(row => (selectedTeacherClass === "all" || row.group_name === selectedTeacherClass) && (!teacherResultSubject || row.subject === teacherResultSubject) && (!teacherResultChapter || row.chapter_name?.toLowerCase() === teacherResultChapter.toLowerCase()));
  const visibleResults = scopedResults.filter(row => `${row.full_name} ${row.roll_number} ${row.exam_title} ${row.group_name}`.toLowerCase().includes(resultSearch.toLowerCase()));
  const scopedTeacherPapers=teacherScope?teacherPapers.filter(paper=>paper.subject===teacherScope.subject&&paper.chapter_name.toLowerCase()===teacherScope.chapter.toLowerCase()&&paper.groups.some(group=>group.slug===teacherScope.groupSlug)):teacherPapers;
  const meritGroups = Array.from(new Map(scopedResults.map(row => [`${row.exam_id}:${row.group_name}`, { examId: row.exam_id, examTitle: row.exam_title, group: row.group_name }])).values());
  const resultAnswerKeys = Array.from(new Map(scopedResults.map(row => [row.exam_id, { examId: row.exam_id, title: row.exam_title, subject: row.subject, chapter: row.chapter_name ?? teacherResultChapter, classes: Array.from(new Set(scopedResults.filter(item => item.exam_id === row.exam_id).map(item => item.group_name))).join(" + ") }])).values());

  useEffect(() => {
    if (!activeExam) return;
    sessionStorage.setItem("ghs_active_exam_ui", JSON.stringify({ examId: activeExam.exam_id, questionIndex: currentQuestion, questionTimesLeft }));
  }, [activeExam, currentQuestion, questionTimesLeft]);

  async function refreshTeacherData() {
    const supabase = createClient();
    const [{ data: records }, { data: papers }] = await Promise.all([supabase.rpc("get_teacher_results"), supabase.rpc("get_teacher_papers")]);
    if (Array.isArray(records)) setTeacherResults(records as TeacherResult[]);
    if (Array.isArray(papers)) setTeacherPapers(papers as TeacherPaper[]);
  }

  async function startExam(examId: string) {
    setBusy(true); setNotice("");
    try {
      sessionStorage.removeItem("ghs_latest_exam_result");
      setResult(null);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("start_exam", { p_exam_id: examId, p_camera_consent: false });
      if (error) throw error;
      const exam = data as ActiveExam;
      setActiveExam({...exam,exam_id:examId}); setCurrentQuestion(0);
      goTo(`/exam/${examId}`);
      setQuestionTimesLeft(exam.duration_seconds === 2700 && exam.questions.length === 60
        ? Object.fromEntries(exam.questions.map((_, index) => [index, 45]))
        : null);
      setWarningCount(Number((data as ActiveExam).warning_count || 0));
      setSecondsLeft(Math.max(0, Math.floor((new Date((data as ActiveExam).expires_at).getTime() - Date.now()) / 1000)));
      setAccept(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to open this examination."); }
    finally { setBusy(false); }
  }

  async function saveAnswer(question: ExamQuestion, optionId: string | null, marked = question.marked_for_review) {
    if (!activeExam) return;
    const attempt = activeExam;
    pendingSaves.current.set(question.id, { questionId: question.id, optionId, marked });
    setActiveExam(prev => prev ? ({ ...prev, questions: prev.questions.map(q => q.id === question.id ? { ...q, answer: optionId, marked_for_review: marked } : q) }) : prev);
    setSaveState("Saving…");
    const supabase = createClient();
    const { error } = await supabase.rpc("save_exam_answer", { p_attempt_id: attempt.attempt_id, p_session_token: attempt.session_token, p_question_id: question.id, p_option_id: optionId, p_marked: marked });
    if (error) { setSaveState("Not yet synced — will retry online"); return; }
    const latest = pendingSaves.current.get(question.id);
    if (latest?.optionId === optionId && latest.marked === marked) pendingSaves.current.delete(question.id);
    setSaveState("All changes saved");
  }

  useEffect(() => {
    if (!activeExam) return;
    const retryPending = async () => {
      const supabase = createClient();
      for (const [key, answer] of pendingSaves.current) {
        const { error } = await supabase.rpc("save_exam_answer", { p_attempt_id: activeExam.attempt_id, p_session_token: activeExam.session_token, p_question_id: answer.questionId, p_option_id: answer.optionId, p_marked: answer.marked });
        if (error) { setSaveState("Not yet synced — will retry online"); break; }
        pendingSaves.current.delete(key);
      }
      if (pendingSaves.current.size === 0) setSaveState("All changes saved");
    };
    window.addEventListener("online", retryPending);
    return () => window.removeEventListener("online", retryPending);
  }, [activeExam]);

  async function submitExam(reason = "student_submit") {
    if (!activeExam || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const supabase = createClient();
      if (reason !== "time_expired") {
        for (const [key, answer] of pendingSaves.current) {
          const { error: saveError } = await supabase.rpc("save_exam_answer", { p_attempt_id: activeExam.attempt_id, p_session_token: activeExam.session_token, p_question_id: answer.questionId, p_option_id: answer.optionId, p_marked: answer.marked });
          if (saveError) throw new Error("Some answers have not synced. Reconnect and submit again to avoid losing them.");
          pendingSaves.current.delete(key);
        }
      }
      const { data, error } = await supabase.rpc("finish_exam", { p_attempt_id: activeExam.attempt_id, p_session_token: activeExam.session_token, p_reason: reason });
      if (error) throw error;
      setResult(data as Record<string, unknown>);
      setResultPending(data?.result_published === false);
      sessionStorage.setItem("ghs_latest_exam_result", JSON.stringify(data));
      goTo("/student/result");
      setActiveExam(null); sessionStorage.removeItem("ghs_active_exam_ui"); setConfirmSubmit(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Submission failed. Please reconnect and try again."); }
    finally { setBusy(false); submitting.current = false; }
  }

  useEffect(() => {
    if (!activeExam) return;
    if (secondsLeft <= 0) { void submitExam("time_expired"); return; }
    const timer = window.setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  // submitExam is intentionally driven by the attempt and countdown state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExam, secondsLeft]);

  useEffect(() => {
    if (!activeExam || questionTimesLeft === null) return;
    const questionSecondsLeft = questionTimesLeft[currentQuestion] ?? 45;
    if (questionSecondsLeft <= 0) {
      if (currentQuestion < activeExam.questions.length - 1) {
        setCurrentQuestion(index => index + 1);
      } else {
        void submitExam("time_expired");
      }
      return;
    }
    const timer = window.setTimeout(() => setQuestionTimesLeft(current => current
      ? { ...current, [currentQuestion]: Math.max(0, (current[currentQuestion] ?? 45) - 1) }
      : current), 1000);
    return () => window.clearTimeout(timer);
  // Per-question pacing applies only to the 60-question, 45-minute paper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExam, currentQuestion, questionTimesLeft]);

  useEffect(() => {
    if (!activeExam) return;
    let lastViolation = 0;
    const violation = async (event: "visibility_hidden" | "window_blur") => {
      const now = Date.now();
      if (now - lastViolation < 1800) return;
      lastViolation = now;
      const supabase = createClient();
      const { data, error } = await supabase.rpc("record_exam_warning", { p_attempt_id: activeExam.attempt_id, p_session_token: activeExam.session_token, p_event: event });
      if (error || !data) return;
      const recordedWarnings = Number(data.warning_count ?? warningCount + 1);
      setWarningCount(recordedWarnings);
      if (recordedWarnings >= 3) {
        setActiveExam(null);
        sessionStorage.removeItem("ghs_active_exam_ui");
        setNotice("Three exam-screen departures were recorded. You have been signed out.");
        await signOut();
        return;
      }
      setFocusWarningCount(recordedWarnings);
      if (data.action === "submit") {
        const finalResult = data.result as Record<string, unknown> | undefined;
        if (finalResult) { setResult(finalResult); setResultPending(finalResult.result_published === false); sessionStorage.setItem("ghs_latest_exam_result", JSON.stringify(finalResult)); setActiveExam(null); sessionStorage.removeItem("ghs_active_exam_ui"); goTo("/student/result"); }
      }
      if (data.action === "lock") { setActiveExam(null); sessionStorage.removeItem("ghs_active_exam_ui"); setNotice("This attempt has been locked after detected warnings. Contact your authorized teacher."); }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") void violation("visibility_hidden"); };
    const onBlur = () => { void violation("window_blur"); };
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("blur", onBlur);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("blur", onBlur); };
  }, [activeExam]);

  useEffect(() => {
    if (!activeExam) return;
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ["c", "x", "u", "p", "s"].includes(key)) event.preventDefault();
      if (key === "printscreen") event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("contextmenu", onContextMenu); document.removeEventListener("keydown", onKeyDown); };
  }, [activeExam]);

  if (authLoading && !profile) return <main className="public-result-page"><section className="result-lookup-card" role="status"><h2>Restoring your secure session…</h2><p>Please wait while we check your saved exam.</p></section></main>;
  if (!profile && showTeacherLogin) return <TeacherLoginGate onBack={()=>goTo("/")} onSubmit={authenticateTeacher}/>;
  if (!profile && !showLogin) return <StudentExamGate onSignIn={()=>goTo("/auth/login")} onTeacherLogin={()=>goTo("/teacher/login")}/>;

  if (result) return <main className="dashboard-shell"><header className="topbar"><a className="brand" href="#home"><span className="brand-mark"><GraduationCap size={23}/></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></a><div className="top-actions"><button className="button button-secondary" onClick={()=>{setResult(null);sessionStorage.removeItem("ghs_latest_exam_result");goTo("/studentdashboard")}}>Back to student dashboard</button><button className="avatar" onClick={signOut}>↗</button></div></header><section className="result-wrap"><div className="result-card"><span className="result-emblem"><ShieldCheck size={25}/></span><div className="eyebrow">OFFICIAL EXAMINATION MARKSHEET</div><h1>{resultPending ? "Result pending" : "Examination submitted"}</h1><p>{resultPending ? "Your submission was received. Your teacher will publish the result when ready." : "Your examination has been submitted successfully."}</p>{!resultPending && <><div className="score-box"><strong>{String(result.marks_obtained ?? "—")}<small> / {String(result.max_marks ?? "—")}</small></strong><span>{String(result.percentage ?? "—")}%</span></div><div className="score-details"><span>Correct <b>{String(result.correct_count ?? 0)}</b></span><span>Incorrect <b>{String(result.incorrect_count ?? 0)}</b></span><span>Unanswered <b>{String(result.unanswered_count ?? 0)}</b></span></div><div className={`pass-label ${result.passed ? "pass" : "fail"}`}>{result.passed ? "PASS" : "NOT PASSED"}</div><button className="button button-primary print-button" onClick={()=>window.print()}>Print marksheet</button></>}</div></section></main>;

  if (activeExam) {
    const question = activeExam.questions[currentQuestion];
    const attempted = activeExam.questions.filter(q=>q.answer).length;
    const formatTime = `${Math.floor(secondsLeft/60).toString().padStart(2,"0")}:${(secondsLeft%60).toString().padStart(2,"0")}`;
    const questionSecondsLeft = questionTimesLeft?.[currentQuestion] ?? null;
    const formatQuestionTime = questionSecondsLeft === null ? null : `${Math.floor(questionSecondsLeft/60).toString().padStart(2,"0")}:${(questionSecondsLeft%60).toString().padStart(2,"0")}`;
    return <main className="exam-runner"><header className="runner-header"><a className="brand" href="#exam"><span className="brand-mark"><GraduationCap size={22}/></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></a><div className="runner-top-right"><span className="warning-count">Warnings <b>{warningCount}/3</b></span>{formatQuestionTime !== null && <span className="timer"><Clock3 size={16}/>Q {formatQuestionTime}</span>}<span className="timer"><Clock3 size={16}/>{formatTime}</span><button className="button button-submit" onClick={()=>setConfirmSubmit(true)}>Submit exam</button></div></header><div className="runner-main"><div className="runner-title"><div><span className="eyebrow">{activeExam.subject} · ONLINE EXAMINATION</span><h1>{formatDisplayText(activeExam.title)}</h1></div><span className="save-status"><Wifi size={14}/>{saveState}</span></div>{notice && <div className="notice warning">{notice}</div>}{focusWarningCount !== null && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="focus-warning-title"><h2 id="focus-warning-title">Return to your exam</h2><p>Warning {focusWarningCount} of 3: You left the examination screen. Your questions are paused until you continue. Leaving the screen one more time will sign you out.</p><div className="modal-actions"><button className="button button-primary" onClick={()=>setFocusWarningCount(null)}>Continue exam</button></div></section></div>}<div className="runner-progress"><div><span>Progress</span><b>{attempted} of {activeExam.questions.length} answered</b></div><div className="progress-track"><i style={{width:`${activeExam.questions.length ? attempted/activeExam.questions.length*100 : 0}%`}}/></div></div><div className="question-layout"><section className="question-card"><div className="question-head"><span>QUESTION {currentQuestion+1} <small>OF {activeExam.questions.length}</small></span><span>{question?.marks ?? 1} mark{Number(question?.marks ?? 1) === 1 ? "" : "s"}</span></div><h2><MathText text={question?.body ?? "No questions are available. Contact your teacher."}/></h2>{question?.image_url && <Image className="question-image" src={question.image_url} alt="Question illustration" width={800} height={500} unoptimized/>}<div className="options-list">{question?.options.map((option,optionIndex)=><button key={option.id} className={`option ${question.answer===option.id?"selected":""}`} onClick={()=>void saveAnswer(question,option.id)}><span className="option-letter">{formatOptionLabel(option.label,optionIndex)}</span><span><MathText text={option.body}/></span>{question.answer===option.id&&<CheckCircle2 size={18}/>}</button>)}</div><div className="question-actions"><button className="review-button" onClick={()=>void saveAnswer(question,question.answer, !question.marked_for_review)}>{question.marked_for_review ? "★ Marked for review" : "☆ Mark for review"}</button><div><button className="button button-secondary" disabled={currentQuestion===0} onClick={()=>setCurrentQuestion(n=>n-1)}>Previous</button><button className="button button-primary next-button" disabled={!question?.answer || currentQuestion>=activeExam.questions.length-1} onClick={()=>setCurrentQuestion(n=>n+1)}>Next question <ArrowRight size={15}/></button></div></div></section><aside className="palette-card"><b>Question palette</b><p>Choose a question to navigate</p><div className="question-palette">{activeExam.questions.map((q,i)=><button key={q.id} className={`${i===currentQuestion?"current":""} ${q.answer?"answered":""} ${q.marked_for_review?"marked":""}`} onClick={()=>setCurrentQuestion(i)}>{i+1}</button>)}</div><div className="palette-legend"><span><i className="answered"/> Answered</span><span><i/> Not answered</span><span><i className="marked"/> For review</span></div></aside></div></div>{confirmSubmit&&<div className="modal-backdrop"><div className="confirm-modal"><h2>Submit your examination?</h2><p>You have answered {attempted} of {activeExam.questions.length} questions. You cannot change answers after submission.</p><div><button className="button button-secondary" onClick={()=>setConfirmSubmit(false)}>Review answers</button><button className="button button-primary" onClick={()=>void submitExam()} disabled={busy}>{busy?"Submitting…":"Confirm submission"}</button></div></div></div>}</main>;
  }

  if (profile) return <main className="dashboard-shell">
    <header className="topbar"><a className="brand" href="#home"><span className="brand-mark"><GraduationCap size={23} /></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></a><div className="top-actions"><span className="secure-label"><ShieldCheck size={15}/> Secure portal</span><button className="avatar" onClick={signOut} title={`Sign out ${userEmail}`}>{profile.full_name?.slice(0,1) || "G"}</button></div></header>
    <section className="welcome-wrap"><div className="welcome"><div><div className="eyebrow"><Sparkles size={14}/> OFFICIAL EXAMINATION PORTAL</div><h1>Welcome, {profile.full_name || "Student"}</h1><p>{studentIdentity ? `${studentIdentity.group_name}${studentIdentity.section ? ` · Section ${studentIdentity.section}` : ""} · Roll ${studentIdentity.roll_number} · ID ${studentIdentity.student_code}` : "Your examination space is ready. Review your assigned examination and instructions carefully."}</p></div><div className="welcome-icon"><BookOpen size={30}/></div></div></section>
    <section className="dashboard-content"><div className="section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>{profile.role === "student" ? "My examination" : "Examination overview"}</h2></div><span className="live-pill"><i/> {studentRegistrationStatus && !studentIdentity ? "Enrollment under review" : "Account verified"}</span></div>
      {selectedExam && <div className="modal-backdrop"><div className="confirm-modal instructions-modal"><span className="eyebrow">PLEASE READ CAREFULLY</span><h2>Before you begin</h2><p className="muted">{selectedExam.title} · {selectedExam.subject}</p><ol>{instructions.map((item,i)=><li key={item}><span>{i+1}</span>{item}</li>)}</ol><label className="accept-line"><input type="checkbox" checked={accept} onChange={event=>setAccept(event.target.checked)}/> I have read and agree to follow these examination instructions.</label><div className="modal-actions"><button className="button button-secondary" onClick={()=>setSelectedExam(null)}>Cancel</button><button className="button button-primary" disabled={!accept || busy} onClick={()=>{const id=selectedExam.id;setSelectedExam(null);void startExam(id)}}>{busy?"Opening…":"I agree — start exam"}<ArrowRight size={15}/></button></div></div></div>}
      {profile.role === "student" ? <div className="student-layout"><article className="exam-card"><div className="exam-card-top"><span className="subject-icon"><BookOpen size={20}/></span><span className="status-badge">{exams.length ? `${exams.length} assigned` : studentRegistrationStatus ? "Enrollment review" : "Assigned to you"}</span></div><div className="exam-meta">GLORIOUS HIGH-TECH SCHOOL <span>•</span> EXAMINATION</div><h3>{exams.length ? "Your assigned examinations" : studentRegistrationStatus ? "Registration received" : "No examination is available"}</h3><p className="muted">Only examinations assigned to your student account are shown. Your class, identity and result access are restricted to your account.</p>{studentRegistrationStatus && !exams.length && <div className="registration-status-card"><span>PAYMENT <b>{studentRegistrationStatus.payment_status}</b></span><span>ENROLLMENT <b>{studentRegistrationStatus.review_status}</b></span><p>Your registration for {studentRegistrationStatus.subject} · {formatDisplayText(studentRegistrationStatus.chapter_name)} is awaiting authorized school review. Exam access appears after approval and assignment.</p></div>}
      {exams.length ? <div className="assigned-exams">{exams.map(exam=><div className="assigned-exam" key={exam.id}><div><b>{formatDisplayText(exam.title)}</b><span>{exam.subject} · {exam.academic_session} · {Math.round(exam.duration_seconds/60)} min{exam.status === "submitted" && exam.marks_obtained !== undefined ? ` · Score ${exam.marks_obtained}/${exam.max_marks}` : ""}</span></div><button className="button button-primary compact-button" disabled={busy || ["submitted","closed","locked"].includes(exam.status)} onClick={()=>{setNotice("");goTo(`/student/payment/${exam.id}`)}}>{exam.status === "submitted" ? "Submitted" : exam.status === "locked" ? "Locked" : exam.status === "active" ? "Open exam" : exam.status === "in_progress" ? "Resume exam" : "Not open"}<ArrowRight size={14}/></button></div>)}</div> : <div className="empty-exams"><LockKeyhole size={17}/><span>No exam has been assigned or opened for your account. Contact your authorized teacher if you think this is a mistake.</span></div>}
      <p className="card-footnote"><ShieldCheck size={14}/> Attempts and grading are verified by the school server.</p></article>
      <aside className="side-note"><div className="note-icon"><ShieldCheck size={21}/></div><h3>Before you begin</h3><p>Review and accept all exam instructions before starting.</p><ul>{instructions.slice(0,3).map((item,i)=><li key={item}><span>{String(i+1).padStart(2,"0")}</span>{item}</li>)}</ul><div className="privacy-note"><LockKeyhole size={15}/><span>Secure session<br/><small>Browser monitoring has practical limitations.</small></span></div></aside></div> : <div className="teacher-workspace">
        <nav className="teacher-tabs" aria-label="Teacher dashboard sections"><button className={teacherTab === "results" ? "active" : ""} onClick={()=>{setTeacherTab("results");goTo("/teacher/results")}}>Results & merit list</button><button className={teacherTab === "papers" ? "active" : ""} onClick={()=>{setTeacherTab("papers");goTo("/teacher/papers")}}>Question papers & preview ({teacherPapers.length})</button><button className={teacherTab === "live" ? "active" : ""} onClick={()=>{setTeacherTab("live");goTo("/teacher/sessions")}}>Active exam sessions</button><button onClick={()=>goTo("/teacher/payments")}>Payments</button></nav>
        {localTeacherMode && <div className="notice warning"><LockKeyhole size={16}/><span>Name/password teacher sign-in is active. Preset question banks can be viewed here; saved papers, active exam sessions and results need the Supabase project configured.</span></div>}
        {teacherTab === "results" ? <>
          <div className="teacher-stats"><article><span>SUBMITTED RESULTS</span><b>{visibleResults.length}</b></article><article><span>CLASSES WITH RESULTS</span><b>{new Set(teacherResults.filter(row=>selectedTeacherClass === "all" || row.group_name === selectedTeacherClass).map(row=>row.group_name)).size}</b></article><article><span>PASS RATE</span><b>{visibleResults.length ? `${Math.round(visibleResults.filter(row=>row.passed).length/visibleResults.length*100)}%` : "—"}</b></article></div>
          <section className="merit-section"><div className="results-toolbar"><div><h3>Class-wise top three</h3><p>Choose a class to see its separate merit list for each exam.</p></div></div>{meritGroups.length ? <div className="merit-grid">{meritGroups.map(group=>{const top=teacherResults.filter(row=>row.exam_id===group.examId&&row.group_name===group.group).sort((a,b)=>a.rank-b.rank).slice(0,3);return <article className="merit-card" key={`${group.examId}:${group.group}`}><span className="eyebrow">{group.group}</span><h4>{group.examTitle}</h4>{top.map(row=><div className={`merit-student rank-${row.rank}`} key={row.attempt_id}><span className="merit-rank">{row.rank===1?"🥇":row.rank===2?"🥈":"🥉"} {row.rank}</span><span className="merit-name"><b>{row.full_name}</b><small>Roll {row.roll_number}</small></span><b className="merit-score">{row.marks_obtained}/{row.max_marks}<small>{row.percentage}%</small></b></div>)}</article>})}</div>:<div className="empty-exams"><Users size={17}/><span>Top-three lists appear when eligible students have submitted exams.</span></div>}</section>
          <section className="results-panel"><div className="results-toolbar"><div><h3>Submitted examination results</h3><p>Class results and the merit list are visible to teachers here after students submit.</p></div><button className="button button-primary export-button" onClick={exportResults} disabled={!visibleResults.length}>Export CSV</button></div><div className="results-filter"><select aria-label="Filter results by class" value={selectedTeacherClass} onChange={event=>setSelectedTeacherClass(event.target.value)}><option value="all">All classes (8–12)</option>{groups.map(group=><option key={group}>{group}</option>)}</select><input value={resultSearch} onChange={event=>setResultSearch(event.target.value)} placeholder="Search student, roll or exam…" aria-label="Search results"/><span>{visibleResults.length} records</span></div>{visibleResults.length ? <div className="results-table-wrap"><table className="results-table"><thead><tr><th>STUDENT</th><th>EXAMINATION</th><th>CLASS</th><th>MARKS</th><th>%</th><th>RANK</th><th>STATUS</th></tr></thead><tbody>{visibleResults.map(row=><tr key={row.attempt_id}><td><b>{row.full_name}</b><small>{row.roll_number} · {row.student_code}</small></td><td><b>{row.exam_title}</b><small>{row.subject} · {row.academic_session}</small></td><td>{row.group_name}{row.section ? ` · ${row.section}` : ""}</td><td>{row.marks_obtained}/{row.max_marks}<small>{row.correct_count} correct · {row.incorrect_count} incorrect · {row.unanswered_count} unanswered</small></td><td>{row.percentage}%</td><td>#{row.rank}</td><td><span className={`result-status ${row.passed?"passed":"failed"}`}>{row.passed?"Pass":"Fail"}</span></td></tr>)}</tbody></table></div> : <div className="empty-exams"><BookOpen size={17}/><span>No submitted results are available in this class, or no records match this search.</span></div>}</section>
          <section className="answer-key-panel"><div className="results-toolbar"><div><h3>Question papers with correct answers</h3><p>Download or print a PDF answer key for the exams in this result view.</p></div></div>{resultAnswerKeys.length ? <div className="answer-key-list">{resultAnswerKeys.map(paper=><article key={paper.examId}><div><b>{formatDisplayText(paper.title)}</b><small>{paper.classes} · {paper.subject} · {formatDisplayText(paper.chapter)}</small></div><TeacherAnswerKeyDownload examId={paper.examId} title={formatDisplayText(paper.title)} subject={paper.subject} chapter={formatDisplayText(paper.chapter)} className={paper.classes}/></article>)}</div> : <div className="empty-exams"><BookOpen size={17}/><span>Question and answer PDFs will appear after examination results are available.</span></div>}</section>
        </> : teacherTab === "papers" ? <div className="paper-workspace"><PaperBuilder onCreated={()=>void refreshTeacherData()} initialGroupSlug={teacherScope?.groupSlug} initialSubject={teacherScope?.subject} initialChapter={teacherScope?.chapter}/><section className="paper-list"><div className="results-toolbar"><div><h3>{teacherScope?"Question papers for selected teaching scope":"Your authorized question papers"}</h3><p>{teacherScope?`${teacherScope.groupSlug} · ${teacherScope.subject} · ${formatDisplayText(teacherScope.chapter)}`:"Draft papers stay hidden from students. The shared Class 10 paper keeps cohort results separate."}</p></div></div>{scopedTeacherPapers.length ? scopedTeacherPapers.map(paper=><div className="paper-list-item" key={paper.id}><article className="paper-row"><div><span className={`result-status ${paper.published?"passed":"failed"}`}>{paper.published?"Published":"Draft"}</span><h4>{formatDisplayText(paper.title)}</h4><p>{paper.subject} · {formatDisplayText(paper.chapter_name)} · {paper.academic_session}</p><small>{paper.groups.map(item=>item.name).join(" + ")} · {paper.max_marks} marks · {Math.round(paper.duration_seconds/60)} minutes</small></div><div className="paper-result-status">Results {paper.results_published?"published":"hidden"}</div></article><TeacherPaperQuestions examId={paper.id}/></div>) : <div className="empty-exams"><BookOpen size={17}/><span>No papers match this class, subject and chapter. You can create a paper here.</span></div>}</section></div> : teacherTab === "live" ? <TeacherLiveProctor backendConfigured={configured && !localTeacherMode}/> : <div className="admin-review-workspace"><ExamPaymentReviewPanel/></div>}
      </div>}
      <div className="groups-row"><span>SUPPORTED EXAM GROUPS</span><div>{groups.map(group=><span key={group}>{group}</span>)}</div></div></section>
    <footer className="footer"><span>© {new Date().getFullYear()} Glorious High-Tech School</span><span><LockKeyhole size={13}/> Protected examination environment</span></footer>
  </main>;

  return <main className="login-shell"><section className="login-art"><div className="art-grid"/><header className="brand brand-light"><span className="brand-mark"><GraduationCap size={24}/></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></header><div className="art-copy"><div className="eyebrow"><Sparkles size={14}/> LEARN. LEAD. EXCEL.</div><h1>Your next<br/><em>achievement</em><br/>starts here.</h1><p>A secure, focused space for every learner to demonstrate what they know.</p><div className="trust-row"><span><ShieldCheck size={17}/> Secure by design</span><span><Users size={17}/> Classes 8–12</span></div></div><div className="art-bottom"><div className="art-decoration"><div/><div/><div/></div><span>EXCELLENCE THROUGH KNOWLEDGE</span></div></section>
    <section className="login-panel"><div className="mobile-brand brand"><span className="brand-mark"><GraduationCap size={23}/></span><span><b>GLORIOUS</b><small>HIGH-TECH SCHOOL</small></span></div><div className="login-form-wrap"><button type="button" className="back-button" onClick={()=>{setNotice("");goTo("/")}}>← Back to result form</button><div className="login-heading"><div className="eyebrow">WELCOME TO YOUR PORTAL</div><h2>{mode === "recover" ? "Reset your password" : "Sign in to continue"}</h2><p>{mode === "recover" ? "Enter your authorized school email and we’ll send reset instructions." : "Use the authorized credentials provided by your school."}</p></div>
      {!configured && <div className="notice warning"><LockKeyhole size={17}/><span>Teacher sign-in is not configured yet. Add Supabase credentials to <b>.env.local</b> and apply the database migrations; login cannot work until then.</span></div>}
      {notice && <div className={`notice ${notice.startsWith("If an account") ? "success" : "warning"}`} role="status">{notice}</div>}
      <form onSubmit={authenticate} className="login-form"><label htmlFor="email">School email address</label><div className="input-wrap"><Mail size={17}/><input id="email" type="email" autoComplete="username" placeholder="you@school.edu" value={email} onChange={e=>setEmail(e.target.value)} required/></div>{mode === "sign-in" && <><div className="password-label"><label htmlFor="password">Password</label><button type="button" className="text-button" disabled={!configured} onClick={()=>{setMode("recover");setNotice("")}}>Forgot password?</button></div><div className="input-wrap"><LockKeyhole size={17}/><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required/></div></>}<button className="button button-primary" disabled={busy || !configured}>{busy ? "Please wait…" : mode === "recover" ? "Send reset instructions" : "Sign in securely"}<ArrowRight size={17}/></button></form>
      {mode === "recover" && <button type="button" className="back-button" onClick={()=>{setMode("sign-in");setNotice("")}}>← Return to sign in</button>}
      <div className="login-divider"><span/></div><div className="portal-note"><span className="portal-note-icon"><Wifi size={16}/></span><p><b>School accounts only</b><br/>Student and staff access is managed by authorized school administrators.</p></div><div className="login-privacy"><LockKeyhole size={13}/> Your credentials are protected with Supabase Auth</div></div><div className="panel-foot"><span>Need help accessing your account?</span><span>Contact your authorized teacher</span></div></section></main>;
}

export default Home;
