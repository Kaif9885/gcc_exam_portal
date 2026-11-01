import { ExamBuilderPage } from "@/components/ExamBuilderPage";

export default async function AdminExamBuilderRoute({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return <ExamBuilderPage role="admin" examId={examId} />;
}
