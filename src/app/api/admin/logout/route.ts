import { NextResponse } from "next/server";
import { adminSessionCookieName, adminSessionCookieOptions } from "@/lib/server/admin-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookieName, "", adminSessionCookieOptions(0));
  return response;
}

