import { NextResponse, type NextRequest } from "next/server";
import { createAdminSession, adminSessionCookieName, adminSessionCookieOptions } from "@/lib/server/admin-session";

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }

  const username = body.username?.trim() || "";
  const password = body.password?.trim() || "";

  if (!username || !password) {
    return NextResponse.json({ error: "Please enter both username and password." }, { status: 400 });
  }

  const validPassword =
    process.env.ADMIN_LOGIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.TEACHER_LOGIN_PASSWORD ||
    "786";

  if (password !== validPassword) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  const adminDisplayName =
    username.toLowerCase() === "admin" || username.toLowerCase() === "administrator"
      ? "Mohammad Arif (Admin)"
      : username;

  const session = createAdminSession(adminDisplayName, username);
  const response = NextResponse.json({
    ok: true,
    user: { name: adminDisplayName, username, role: "admin" },
  });

  response.cookies.set(adminSessionCookieName, session.token, adminSessionCookieOptions(session.maxAge));
  return response;
}

