import type { NextRequest } from "next/server";

const COOKIE_NAME = "teacher_session";
const APPROVED_TEACHERS = ["Waseem Akram", "Md Naseem", "Md Meraj", "Tabrej Alam", "Md Arif", "Md Reyaj", "Nisha Kumari", "Nargis Bano", "Er. Faiz"];

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

export async function getTeacherSessionEdge(request: NextRequest): Promise<{ name: string; mode: string } | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.TEACHER_SESSION_SECRET;
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { name?: string; mode?: string; exp?: number };
    const name = APPROVED_TEACHERS.find(item => item.toLowerCase() === session.name?.toLowerCase());
    if (!name || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return { name, mode: session.mode || "all" };
  } catch { return null; }
}
