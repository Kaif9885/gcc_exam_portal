import { Suspense } from "react";
import { TeacherDashboard } from "@/components/TeacherDashboard";

export default function TeacherPortalPage() {
  return (
    <Suspense fallback={<div className="admin-shell"><div style={{ padding: 32 }}>Loading teacher dashboard…</div></div>}>
      <TeacherDashboard />
    </Suspense>
  );
}
