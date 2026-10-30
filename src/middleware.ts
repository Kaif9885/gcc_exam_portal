import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getTeacherSessionEdge } from "@/lib/server/teacher-session-edge";
import { hasStudentSessionEdge } from "@/lib/server/student-session-edge";
import { hasAdminSessionEdge } from "@/lib/server/admin-session-edge";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const adminLoginRoute = pathname === "/admin/login";
  const adminRoute = (pathname === "/admin" || pathname.startsWith("/admin/")) && !adminLoginRoute;
  const teacherLoginRoute = pathname === "/teacher/login";
  const teacherRoute = (pathname === "/teacher" || pathname.startsWith("/teacher/")) && !teacherLoginRoute;
  const mongoStudentRoute = pathname === "/studentdashboard" || pathname.startsWith("/studentdashboard/")
    || pathname === "/student/exams" || pathname === "/student/results" || pathname === "/student/result"
    || pathname.startsWith("/student/payment/") || pathname === "/exam" || pathname.startsWith("/exam/");
  const studentRoute = pathname.startsWith("/student/payment/") || pathname === "/student/result" || pathname === "/exam" || pathname.startsWith("/exam/");

  if (!teacherRoute && !teacherLoginRoute && !adminRoute && !adminLoginRoute && !studentRoute && !mongoStudentRoute) {
    return response;
  }

  const redirectTo = (target: URL | string) => {
    const redirected = NextResponse.redirect(target instanceof URL ? target : new URL(target, request.url));
    response.cookies.getAll().forEach(cookie => redirected.cookies.set(cookie));
    return redirected;
  };

  if (adminLoginRoute) {
    if (await hasAdminSessionEdge(request)) return redirectTo("/admin/dashboard");
    return response;
  }

  if (adminRoute) {
    if (await hasAdminSessionEdge(request)) {
      if (pathname === "/admin") return redirectTo("/admin/dashboard");
      return response;
    }
    return redirectTo("/admin/login");
  }

  const localTeacher = await getTeacherSessionEdge(request);
  if (teacherLoginRoute) {
    if (localTeacher) return redirectTo("/teacher");
    return response;
  }

  if (teacherRoute) {
    if (localTeacher) return response;
    return redirectTo("/teacher/login");
  }

  if (mongoStudentRoute) {
    if (!(await hasStudentSessionEdge(request))) return redirectTo("/student");
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const loginPath = teacherRoute || adminRoute ? "/teacher/login" : "/student";
    return redirectTo(`${loginPath}?next=${encodeURIComponent(pathname)}`);
  }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const loginPath = teacherRoute || adminRoute ? "/teacher/login" : "/student";
    return redirectTo(`${loginPath}?next=${encodeURIComponent(pathname)}`);
  }
  const { data: profile } = await supabase.from("profiles").select("role,full_name").eq("id", user.id).maybeSingle();
  if (teacherRoute && profile?.role !== "teacher" && profile?.role !== "admin") {
    return redirectTo("/teacher/login");
  }
  if (teacherRoute && profile?.role === "teacher") {
    const { data: authorized } = await supabase.rpc("is_authorized_teacher_login", { p_full_name: profile.full_name });
    if (authorized !== true) return redirectTo("/teacher/login");
  }
  if (adminRoute && profile?.role !== "admin") return redirectTo("/teacher/login");
  if (studentRoute) {
    const { data: allowed } = await supabase.rpc("is_authorized_student_login");
    if (profile?.role !== "student" || allowed !== true) {
      return redirectTo("/auth/login");
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
