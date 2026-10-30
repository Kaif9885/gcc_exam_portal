import { redirect } from "next/navigation";

export default function TeacherPapersPage() {
  redirect("/teacher?tab=papers");
}
