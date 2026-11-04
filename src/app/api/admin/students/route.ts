import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getAdminSession } from "@/lib/server/admin-session";

export async function GET(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    const db = await getMongoDb();
    const [students, groups] = await Promise.all([
      db.collection("students").find({}).sort({ roll_number: 1 }).toArray(),
      db.collection("examGroups").find({}).sort({ slug: 1 }).toArray(),
    ]);

    const groupMap = new Map(groups.map(g => [String(g.id ?? g._id), g]));

    const formattedStudents = students.map(student => {
      const group = student.exam_group_id ? groupMap.get(String(student.exam_group_id)) : null;
      return {
        id: String(student.id ?? student._id),
        fullName: String(student.full_name ?? "Student"),
        rollNumber: String(student.roll_number ?? "—"),
        studentCode: String(student.student_code ?? "—"),
        classSlug: String(group?.slug ?? "general"),
        className: String(group?.name ?? "General Class"),
        active: Boolean(student.active ?? true),
        testCandidate: Boolean(student.test_candidate),
      };
    });

    formattedStudents.sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className);
      return Number(a.rollNumber) - Number(b.rollNumber);
    });

    return NextResponse.json({
      students: formattedStudents,
      groups: groups.map(g => ({ id: String(g.id ?? g._id), slug: String(g.slug), name: String(g.name) })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin students fetch failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load students roster." }, { status: 503 });
  }
}

