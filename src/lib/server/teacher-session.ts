import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "teacher_session";
const SESSION_SECONDS = 60 * 60 * 12;
export const approvedTeacherNames = ["Waseem Akram", "Md Naseem", "Md Meraj", "Tabrej Alam", "Md Arif", "Md Reyaj", "Nisha Kumari", "Nargis Bano", "Er. Faiz"];
export type TeacherPortalMode = "questions" | "monitor" | "results" | "all" | string;

function signature(value: string) {
  const secret = process.env.TEACHER_SESSION_SECRET;
  if (!secret) throw new Error("Teacher login is not configured. Set TEACHER_SESSION_SECRET.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createTeacherSession(name: string, mode: TeacherPortalMode = "all") {
  const payload = Buffer.from(JSON.stringify({ name, mode, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, maxAge: SESSION_SECONDS };
}

export function getTeacherSession(request: NextRequest): { name: string; mode: string } | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra) return null;
  let expected: string;
  try { expected = signature(payload); } catch { return null; }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { name?: string; mode?: string; exp?: number };
    if (!session.name || !approvedTeacherNames.some(name => name.toLowerCase() === session.name?.toLowerCase()) || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    const name = approvedTeacherNames.find(item => item.toLowerCase() === session.name?.toLowerCase()) ?? null;
    const mode = session.mode || "all";
    return name ? { name, mode } : null;
  } catch { return null; }
}

export const teacherSessionCookieName = COOKIE_NAME;
export const teacherSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
