import type { NextRequest } from "next/server";

const COOKIE_NAME = "student_session";
function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

export async function hasStudentSessionEdge(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.STUDENT_SESSION_SECRET || process.env.TEACHER_SESSION_SECRET;
  if (!token || !secret) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(payload));
    if (!valid) return false;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { fullName?: string; rollNumber?: string; groupId?: string; exp?: number };
    return Boolean(session.fullName && session.rollNumber && session.groupId && session.exp && session.exp > Math.floor(Date.now() / 1000));
  } catch { return false; }
}
