import { redirect } from "next/navigation";

export default function TeacherSessionsPage() {
  redirect("/teacher?tab=sessions");
}
