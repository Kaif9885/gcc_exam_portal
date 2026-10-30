import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const studentSessionCookieName = "student_session";
const SESSION_SECONDS = 60 * 60 * 12;

function signature(payload: string) {
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.TEACHER_SESSION_SECRET;
  if (!secret) throw new Error("Student sessions are not configured. Set STUDENT_SESSION_SECRET in .env.local.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export type StudentSession = { fullName: string; rollNumber: string; classSlug: string; className: string; groupId: string; board: string; exp: number };

export function createStudentSession(identity: Omit<StudentSession, "exp">) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...identity, exp })).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, maxAge: SESSION_SECONDS };
}

export function getStudentSession(request: NextRequest): StudentSession | null {
  const token = request.cookies.get(studentSessionCookieName)?.value;
  if (!token) return null;
  const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra) return null;
  try {
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(provided);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StudentSession;
    if (!session.fullName || !session.rollNumber || !session.groupId || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
}

export const studentSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge,
});
