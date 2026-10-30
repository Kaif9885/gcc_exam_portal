"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = { fullName?: string; rollNumber?: string; board?: string; groupSlug?: string; isAuthenticated?: boolean; onSignIn?: () => void; onTeacherLogin?: () => void };
type ResultRow = { exam_title: string; subject: string; chapter_name: string; class_name: string; academic_session: string; correct_count: number; incorrect_count: number; unanswered_count: number; marks_obtained: number; max_marks: number; percentage: number; passed: boolean; submitted_at: string };
const boardOptions = ["BSEB", "CBSE"];
const classOptions = [{ name:"Class 8", slug:"class-8" },{ name:"Class 9", slug:"class-9" },{ name:"Class 10 Boys", slug:"class-10-boys" },{ name:"Class 10 Girls", slug:"class-10-girls" },{ name:"Class 11", slug:"class-11" },{ name:"Class 12", slug:"class-12" }];

export function MyResultLookup({ fullName = "", rollNumber = "", board = "", groupSlug = "", isAuthenticated = true, onSignIn, onTeacherLogin }: Props) {
  const [selectedBoard,setSelectedBoard]=useState(board);
  const [selectedGroup,setSelectedGroup]=useState(groupSlug);
  const [subject,setSubject]=useState("");
  const [chapter,setChapter]=useState("");
  const availableSubjects=selectedGroup==="class-9"?["Physics"]:["class-8","class-10-boys","class-10-girls","class-11","class-12"].includes(selectedGroup)?["Biology"]:[];
  const availableChapters=subject==="Biology"&&selectedGroup==="class-8"?["Microbes: Friend and Foe"]:subject==="Physics"&&selectedGroup==="class-9"?["Motion"]:subject==="Biology"&&(selectedGroup==="class-10-boys"||selectedGroup==="class-10-girls")?["Control and Coordination"]:subject==="Biology"&&selectedGroup==="class-11"?["Biological Classification"]:subject==="Biology"&&selectedGroup==="class-12"?["Sexual Reproduction in Flowering Plants"]:[];
  const [studentName,setStudentName]=useState(fullName);
  const [studentRoll,setStudentRoll]=useState(rollNumber);
  const [results,setResults]=useState<ResultRow[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function lookup(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");setResults([]);
    try{
      if (!isAuthenticated) { setMessage("Sign in with your school account to verify that this name and roll number belong to you. Results are never exposed using name and roll number alone."); return; }
      const supabase=createClient();
      const {data,error}=await supabase.rpc("get_my_result_lookup",{p_board:selectedBoard,p_group_slug:selectedGroup,p_subject:subject,p_chapter_name:chapter,p_full_name:studentName,p_roll_number:studentRoll});
      if(error)throw error;
      const found=(Array.isArray(data)?data:[]) as ResultRow[];
      setResults(found);setMessage(found.length?"Published result found.":"No published result found for these selections.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to check the result.");}
    finally{setBusy(false);}
  }

  return <section className="result-lookup-card" aria-label="Student result lookup"><header className="lookup-heading"><div className="lookup-logo"><Image src="https://gcc-result-out.onrender.com/static/logo.jpeg" alt="Glorious Coaching Centre logo" width={64} height={64} unoptimized/><span>Estd. 2011</span></div><div><b>GLORIOUS COACHING CENTRE</b><small>ARANDA, HASANPURA</small></div></header><div className="lookup-rule"/><h2>Check Your Result</h2><p>Enter your name and roll number to view your result.</p><form className="lookup-form" onSubmit={lookup}>
    <label htmlFor="lookup-board">Board</label><select id="lookup-board" value={selectedBoard} onChange={event=>{setSelectedBoard(event.target.value);setSelectedGroup("")}}><option value="" disabled>Select board</option>{boardOptions.map(item=><option key={item}>{item}</option>)}</select>
    <label htmlFor="lookup-class">Class</label><select id="lookup-class" value={selectedGroup} onChange={event=>{setSelectedGroup(event.target.value);setSubject("");setChapter("")}}><option value="" disabled>Select class</option>{classOptions.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
    <label htmlFor="lookup-subject">Subject</label><select id="lookup-subject" value={subject} onChange={event=>{setSubject(event.target.value);setChapter("")}} disabled={!availableSubjects.length}><option value="" disabled>Select subject</option>{availableSubjects.map(item=><option key={item}>{item}</option>)}</select>
    <label htmlFor="lookup-chapter">Chapter name</label><select id="lookup-chapter" value={chapter} onChange={event=>setChapter(event.target.value)} required disabled={!availableChapters.length}><option value="" disabled>Select chapter</option>{availableChapters.map(item=><option key={item}>{item}</option>)}</select>
    <label htmlFor="lookup-name">Student name</label><input id="lookup-name" value={studentName} onChange={event=>setStudentName(event.target.value)} required maxLength={120}/>
    <label htmlFor="lookup-roll">Roll number</label><input id="lookup-roll" value={studentRoll} onChange={event=>setStudentRoll(event.target.value)} required maxLength={32}/>
    <button className="button button-primary lookup-submit" disabled={busy || !selectedBoard || !selectedGroup || !subject || !chapter}><Search size={15}/>{busy?"Checking…":"View result"}</button>
  </form>{message&&<div className={`lookup-message ${results.length?"success":""}`} role="status">{message}{!isAuthenticated&&onSignIn&&<button type="button" className="inline-login-button" onClick={onSignIn}>Student sign in</button>}</div>}{results.map((item,index)=><article className="lookup-result" key={`${item.exam_title}-${item.submitted_at}-${index}`}><span className={`pass-label ${item.passed?"pass":"fail"}`}>{item.passed?"PASS":"NOT PASSED"}</span><h4>{item.exam_title}</h4><p>{item.subject} · {item.chapter_name} · {item.class_name}</p><div className="lookup-score"><b>{item.marks_obtained}/{item.max_marks}</b><strong>{item.percentage}%</strong></div><small>{item.correct_count} correct · {item.incorrect_count} incorrect · {item.unanswered_count} unanswered</small><button className="button button-secondary lookup-print" type="button" onClick={()=>window.print()}>Print result</button></article>)}<footer className="lookup-footer">{onTeacherLogin&&<button type="button" onClick={onTeacherLogin}>Teacher Login</button>}</footer></section>;
}
