"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { formatDisplayText } from "@/lib/format-display";

const groups = [
  { name: "Class 8", slug: "class-8" }, { name: "Class 9", slug: "class-9" },
  { name: "Class 10 Boys", slug: "class-10-boys" }, { name: "Class 10 Girls", slug: "class-10-girls" },
  { name: "Class 11", slug: "class-11" }, { name: "Class 12", slug: "class-12" },
];
type OptionDraft = { label: string; body: string; is_correct: boolean };
type QuestionDraft = { body: string; marks: number; options: OptionDraft[] };
const newQuestion = (): QuestionDraft => ({ body: "", marks: 1, options: ["A", "B", "C", "D"].map((label, index) => ({ label, body: "", is_correct: index === 0 })) });

export function PaperBuilder({ onCreated, initialGroupSlug, initialSubject, initialChapter }: { onCreated: () => void; initialGroupSlug?: string; initialSubject?: string; initialChapter?: string }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(initialSubject || "Biology");
  const [chapter, setChapter] = useState(initialChapter || "");
  const [session, setSession] = useState("2026-27");
  const [group, setGroup] = useState(initialGroupSlug || "class-8");
  const [shareClass10, setShareClass10] = useState(false);
  const [duration, setDuration] = useState(60);
  const [passingMarks, setPassingMarks] = useState(0);
  const [publish, setPublish] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const autoLoadedScope = useRef("");
  const maxMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  const isClass10 = group === "class-10-boys" || group === "class-10-girls";

  function updateQuestion(index: number, update: Partial<QuestionDraft>) {
    setQuestions(current => current.map((question, i) => i === index ? { ...question, ...update } : question));
  }
  function updateOption(questionIndex: number, optionIndex: number, body: string) {
    setQuestions(current => current.map((question, i) => i === questionIndex ? { ...question, options: question.options.map((option, j) => j === optionIndex ? { ...option, body } : option) } : question));
  }
  function setCorrect(questionIndex: number, optionIndex: number) {
    setQuestions(current => current.map((question, i) => i === questionIndex ? { ...question, options: question.options.map((option, j) => ({ ...option, is_correct: j === optionIndex })) } : question));
  }

  async function createPaper(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/teacher/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), subject, chapter_name: chapter.trim(), academic_session: session.trim(),
          group_slug: group, share_class10: shareClass10 && isClass10, duration_minutes: Number(duration),
          passing_marks: Number(passingMarks), publish, questions,
        }),
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Paper could not be created.");
      setMessage(json.message ?? (publish ? "Question paper created and published to the selected class group(s)." : "Question paper saved as a draft. It is not visible to students until published."));
      setTitle(""); setChapter(""); setQuestions([newQuestion()]); onCreated();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be created."); }
    finally { setBusy(false); }
  }

  async function loadClass12Preset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper-presets/class12-biology-reproduction", { cache: "no-store" });
      const preset = await response.json();
      if (!response.ok) throw new Error(preset.error ?? "Could not load the authorized Class 12 paper.");
      setTitle(preset.title); setSubject(preset.subject); setChapter(preset.chapter_name);
      setGroup(preset.group_slug); setShareClass10(false); setDuration(preset.duration_minutes);
      setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
      setMessage(`Loaded ${preset.questions.length} questions for a 45-minute exam (45 seconds per question). Review the paper before saving or publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be loaded."); }
    finally { setBusy(false); }
  }

  async function loadClass11Preset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper-presets/class11-biology-classification", { cache: "no-store" });
      const preset = await response.json();
      if (!response.ok) throw new Error(preset.error ?? "Could not load the authorized Class 11 paper.");
      setTitle(preset.title); setSubject(preset.subject); setChapter(preset.chapter_name);
      setGroup(preset.group_slug); setShareClass10(false); setDuration(preset.duration_minutes);
      setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
      setMessage(`Loaded ${preset.questions.length} questions for a 45-minute exam (45 seconds per question). Review the paper before saving or publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be loaded."); }
    finally { setBusy(false); }
  }

  async function loadClass10Preset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper-presets/class10-biology-control-coordination", { cache: "no-store" });
      const preset = await response.json();
      if (!response.ok) throw new Error(preset.error ?? "Could not load the authorized Class 10 paper.");
      setTitle(preset.title); setSubject(preset.subject); setChapter(preset.chapter_name);
      setGroup(preset.group_slug); setShareClass10(preset.share_class10); setDuration(preset.duration_minutes);
      setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
      setMessage(`Loaded ${preset.questions.length} questions for both Class 10 groups. Duration is 45 minutes (45 seconds per question). Review before publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be loaded."); }
    finally { setBusy(false); }
  }

  async function loadClass9Preset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper-presets/class9-physics-motion", { cache: "no-store" });
      const preset = await response.json();
      if (!response.ok) throw new Error(preset.error ?? "Could not load the authorized Class 9 paper.");
      setTitle(preset.title); setSubject(preset.subject); setChapter(preset.chapter_name);
      setGroup(preset.group_slug); setShareClass10(false); setDuration(preset.duration_minutes);
      setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
      setMessage(`Loaded ${preset.questions.length} questions for a 45-minute exam (45 seconds per question). Review before saving or publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be loaded."); }
    finally { setBusy(false); }
  }

  async function loadClass8Preset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/paper-presets/class8-biology-microbes", { cache: "no-store" });
      const preset = await response.json();
      if (!response.ok) throw new Error(preset.error ?? "Could not load the authorized Class 8 paper.");
      setTitle(formatDisplayText(preset.title)); setSubject(preset.subject); setChapter(preset.chapter_name);
      setGroup(preset.group_slug); setShareClass10(false); setDuration(preset.duration_minutes);
      setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
      setMessage(`Loaded ${preset.questions.length} questions for a 45-minute exam (45 seconds per question). Review before saving or publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Paper could not be loaded."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!initialGroupSlug || !initialSubject || !initialChapter) return;
    const key = `${initialGroupSlug}:${initialSubject}:${initialChapter.toLowerCase()}`;
    if (autoLoadedScope.current === key) return;
    const matchingPreset: Record<string, { subject: string; chapter: string; path: string }> = {
      "class-8": { subject: "Biology", chapter: "Microbes: Friend and Foe", path: "class8-biology-microbes" },
      "class-9": { subject: "Physics", chapter: "Motion", path: "class9-physics-motion" },
      "class-10-boys": { subject: "Biology", chapter: "Control and Coordination", path: "class10-biology-control-coordination" },
      "class-10-girls": { subject: "Biology", chapter: "Control and Coordination", path: "class10-biology-control-coordination" },
      "class-11": { subject: "Biology", chapter: "Biological Classification", path: "class11-biology-classification" },
      "class-12": { subject: "Biology", chapter: "Sexual Reproduction in Flowering Plants", path: "class12-biology-reproduction" },
    };
    const presetInfo = matchingPreset[initialGroupSlug];
    if (!presetInfo || presetInfo.subject !== initialSubject || presetInfo.chapter.toLowerCase() !== initialChapter.toLowerCase()) return;
    autoLoadedScope.current = key;
    let cancelled = false;
    async function loadSelectedPreset() {
      setBusy(true); setMessage("");
      try {
        const response = await fetch(`/api/paper-presets/${presetInfo.path}`, { cache: "no-store" });
        const preset = await response.json();
        if (!response.ok) throw new Error(preset.error ?? "Could not load the selected class question paper.");
        if (cancelled) return;
        setTitle(preset.title); setSubject(preset.subject); setChapter(preset.chapter_name);
        setGroup(preset.group_slug); setShareClass10(Boolean(preset.share_class10)); setDuration(preset.duration_minutes);
        setPassingMarks(preset.passing_marks); setQuestions(preset.questions);
        setMessage(`Loaded ${preset.questions.length} questions for ${preset.chapter_name}. Review the paper below.`);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Paper could not be loaded.");
      } finally { if (!cancelled) setBusy(false); }
    }
    void loadSelectedPreset();
    return () => {
      cancelled = true;
      if (autoLoadedScope.current === key) autoLoadedScope.current = "";
    };
  }, [initialGroupSlug, initialSubject, initialChapter]);

  return <form className="paper-builder" onSubmit={createPaper}>
    <div className="builder-intro"><div><span className="eyebrow">QUESTION PAPER AUTHORING</span><h3>Create an examination</h3><p>Build an MCQ paper. Every question needs four choices and one answer key.</p></div><div className="preset-actions"><button type="button" className="button button-secondary preset-button" onClick={()=>void loadClass8Preset()} disabled={busy}>Load {formatDisplayText("Class 8 Microbes: Friend and Foe")} · 60 Q</button><button type="button" className="button button-secondary preset-button" onClick={()=>void loadClass9Preset()} disabled={busy}>Load Class 9 Physics Motion · 60 Q</button><button type="button" className="button button-secondary preset-button" onClick={()=>void loadClass10Preset()} disabled={busy}>Load Class 10 Biology Control and Coordination · 60 Q</button><button type="button" className="button button-secondary preset-button" onClick={()=>void loadClass11Preset()} disabled={busy}>Load Class 11 Biology Biological Classification · 60 Q</button><button type="button" className="button button-secondary preset-button" onClick={()=>void loadClass12Preset()} disabled={busy}>Load Class 12 Biology Sexual Reproduction · 60 Q</button></div></div>
    {message && <div className={`notice ${message.includes("created") || message.includes("saved as") ? "success" : "warning"}`} role="status">{message}</div>}
    <div className="paper-fields"><div><label htmlFor="paper-title">Examination name</label><input id="paper-title" value={title} onChange={event=>setTitle(event.target.value)} required maxLength={140} placeholder="e.g. Unit assessment"/></div><div><label htmlFor="paper-session">Academic session</label><input id="paper-session" value={session} onChange={event=>setSession(event.target.value)} required maxLength={40}/></div><div><label htmlFor="paper-subject">Subject</label><select id="paper-subject" value={subject} onChange={event=>setSubject(event.target.value)}><option>Biology</option><option>Physics</option><option>Chemistry</option></select></div><div><label htmlFor="paper-chapter">Chapter name</label><input id="paper-chapter" value={formatDisplayText(chapter)} onChange={event=>setChapter(event.target.value.replaceAll("Microbes ", "Microbes: "))} required maxLength={140} placeholder="Chapter / unit"/></div><div><label htmlFor="paper-group">Class group</label><select id="paper-group" value={group} onChange={event=>{setGroup(event.target.value);setShareClass10(false)}}>{groups.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div><div><label htmlFor="paper-duration">Duration (minutes)</label><input id="paper-duration" type="number" min={1} max={300} value={duration} onChange={event=>setDuration(Number(event.target.value))} required/></div><div><label htmlFor="paper-passing">Passing marks</label><input id="paper-passing" type="number" min={0} max={maxMarks} step="0.25" value={passingMarks} onChange={event=>setPassingMarks(Number(event.target.value))} required/></div></div>
    {isClass10 && <label className="share-paper"><input type="checkbox" checked={shareClass10} onChange={event=>setShareClass10(event.target.checked)}/><span><b>Share the exact same paper with Class 10 Boys and Girls</b><small>Both classes keep independent enrollments, attempts, results and rankings. Teacher must be assigned to both groups.</small></span></label>}
    <div className="question-builder-head"><div><h4>Questions</h4><span>{questions.length} questions · {maxMarks} total marks</span></div><button className="button button-secondary add-question" type="button" onClick={()=>setQuestions(current=>[...current,newQuestion()])}><Plus size={14}/> Add question</button></div>
    <div className="question-drafts">{questions.map((question,index)=><article className="question-draft" key={index}><div className="draft-head"><b>Question {index+1}</b><div><label>Marks <input type="number" min={0.25} step="0.25" value={question.marks} onChange={event=>updateQuestion(index,{marks:Number(event.target.value)})}/></label>{questions.length>1&&<button type="button" className="icon-danger" aria-label={`Remove question ${index+1}`} onClick={()=>setQuestions(current=>current.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>}</div></div><textarea value={question.body} onChange={event=>updateQuestion(index,{body:event.target.value})} placeholder="Type the question text" rows={2} required maxLength={2000}/><div className="option-editor">{question.options.map((option,optionIndex)=><label className="option-edit" key={option.label}><input type="radio" name={`correct-${index}`} checked={option.is_correct} onChange={()=>setCorrect(index,optionIndex)} aria-label={`Mark option ${option.label} correct`}/><span>{option.label}</span><input value={option.body} onChange={event=>updateOption(index,optionIndex,event.target.value)} placeholder={`Option ${option.label}`} required maxLength={500}/></label>)}</div><p className="answer-help">Select the radio button beside the correct answer. The key stays server-side.</p></article>)}</div>
    <div className="builder-footer"><label className="publish-toggle"><input type="checkbox" checked={publish} onChange={event=>setPublish(event.target.checked)}/><span>Publish immediately after creating</span></label><button className="button button-primary" disabled={busy || passingMarks>maxMarks}><Save size={15}/>{busy ? "Saving paper…" : publish ? "Create and publish" : "Save as draft"}</button></div>
  </form>;
}
