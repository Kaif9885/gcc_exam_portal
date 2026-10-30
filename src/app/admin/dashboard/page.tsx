import { Suspense } from "react";
import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="admin-shell"><div style={{ padding: 32 }}>Loading admin dashboard…</div></div>}>
      <AdminDashboard />
    </Suspense>
  );
}

