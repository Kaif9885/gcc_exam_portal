import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/server/admin-session";

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    admin: {
      name: session.name,
      username: session.username,
      role: session.role,
    },
  });
}

