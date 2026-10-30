import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const adminSessionCookieName = "admin_session";
const SESSION_SECONDS = 60 * 60 * 12;

function signature(value: string) {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.TEACHER_SESSION_SECRET || "glorious-admin-session-secret-2026";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export type AdminSession = { username: string; name: string; role: "admin"; exp: number };

export function createAdminSession(name = "Administrator", username = "admin") {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ username, name, role: "admin", exp })).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, maxAge: SESSION_SECONDS };
}

export function getAdminSession(request: NextRequest): AdminSession | null {
  const token = request.cookies.get(adminSessionCookieName)?.value;
  if (!token) return null;
  const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra) return null;
  let expected: string;
  try { expected = signature(payload); } catch { return null; }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (!session.username || session.role !== "admin" || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
}

export const adminSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

