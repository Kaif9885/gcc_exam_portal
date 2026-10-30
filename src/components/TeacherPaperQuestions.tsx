"use client";

import { useState } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Question={id:string;position:number;body:string;marks:number;image_url:string|null;options:{label:string;body:string;is_correct:boolean}[]};

export function TeacherPaperQuestions({examId}:{examId:string}){
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [error,setError]=useState("");
  async function toggle(){
    if(open){setOpen(false);return;}
    setOpen(true);
    if(questions.length)return;
    setLoading(true);setError("");
    try{
      const supabase=createClient();
      const {data,error}=await supabase.rpc("get_teacher_paper_questions",{p_exam_id:examId});
      if(error)throw error;
      setQuestions(Array.isArray(data)?data as Question[]:[]);
    }catch(error){setError(error instanceof Error?error.message:"Could not load the authorized question paper.");}
    finally{setLoading(false);}
  }
  return <div className="teacher-paper-preview"><button type="button" className="paper-preview-toggle" onClick={()=>void toggle()}>{open?<EyeOff size={13}/>:<Eye size={13}/>} {open?"Hide questions":"Preview questions"} <BookOpen size={13}/></button>{open&&<div className="paper-question-list">{loading?<span>Loading questions…</span>:error?<span className="preview-error">{error}</span>:questions.map((question,index)=><article key={question.id}><b>Q{index+1}. {question.body}</b><small>{question.marks} mark{question.marks===1?"":"s"}</small><ol>{question.options.map(option=><li key={option.label} className={option.is_correct?"answer-key":""}><strong>{option.label}.</strong> {option.body}{option.is_correct&&<em>Answer</em>}</li>)}</ol></article>)}</div>}</div>;
}
