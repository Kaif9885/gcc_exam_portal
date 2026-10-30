"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function RouteHistoryControls() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname.startsWith("/exam/") || pathname.startsWith("/student")) return null;

  return <nav className="route-history-controls" aria-label="Page navigation">
    <button type="button" aria-label="Go back" title="Go back" onClick={() => router.back()}><ArrowLeft size={16}/></button>
    <button type="button" aria-label="Go forward" title="Go forward" onClick={() => window.history.forward()}><ArrowRight size={16}/></button>
  </nav>;
}
