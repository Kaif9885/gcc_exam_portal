import { ExamBuilderPage } from "@/components/ExamBuilderPage";

export default async function TeacherExamBuilderRoute({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return <ExamBuilderPage role="teacher" examId={examId} />;
}
