"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { PaperBuilder, type ExistingExam } from "@/components/PaperBuilder";

type Props = {
  role: "admin" | "teacher";
  examId: string;
};

export function ExamBuilderPage({ role, examId }: Props) {
  const router = useRouter();
  const [exam, setExam] = useState<ExistingExam | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isNewExam = examId === "new";
  const dashboardUrl = role === "admin" ? "/admin/dashboard" : "/teacher";
  const returnUrl = `${dashboardUrl}?tab=papers`;

  useEffect(() => {
    let active = true;
    async function loadExam() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/${role}/papers`, { cache: "no-store" });
        if (response.status === 401) {
          if (active) setError("Your session has expired. Redirecting to sign in…");
          router.replace(`/${role}/login`);
          return;
        }
        const json = await response.json() as { papers?: ExistingExam[]; error?: string };
        if (!response.ok) throw new Error(json.error ?? "Could not load exams.");
        if (!active) return;
        if (isNewExam) {
          setExam(undefined);
        } else {
          const selectedExam = json.papers?.find(paper => paper.id === examId);
          if (!selectedExam) throw new Error("The requested exam could not be found.");
          setExam(selectedExam);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load the exam builder.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadExam();
    return () => { active = false; };
  }, [examId, isNewExam, role]);

  return (
    <main className="exam-builder-page">
      <div className="exam-builder-page-content">
        <button className="button button-secondary compact-button" type="button" onClick={() => router.push(returnUrl)}>
          <ArrowLeft size={14} /> Back to exams
        </button>
        {loading ? (
          <p role="status">Loading exam builder…</p>
        ) : error ? (
          <div className="notice warning" role="alert">{error}</div>
        ) : (
          <PaperBuilder
            key={exam?.id ?? "new-exam"}
            initialExam={exam}
            onCreated={() => router.push(`${returnUrl}&examSaved=${exam ? "updated" : "created"}`)}
          />
        )}
      </div>
    </main>
  );
}
