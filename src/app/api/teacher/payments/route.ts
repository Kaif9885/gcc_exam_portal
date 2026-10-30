import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getTeacherSession } from "@/lib/server/teacher-session";

export async function GET(request: NextRequest) {
  const teacher = getTeacherSession(request);
  if (!teacher) return NextResponse.json({ error: "Teacher session required." }, { status: 401 });
  try {
    const db = await getMongoDb();
    const rows = await db.collection("examPaymentSubmissions").find({}).sort({ created_at: -1 }).limit(300).toArray();
    const groups = await db.collection("examGroups").find({}).toArray();
    const groupNames = new Map(groups.map(group => [String(group.id ?? group._id), String(group.name)]));
    return NextResponse.json({ payments: rows.map(row => ({
      id: String(row.id ?? row._id), student_name: String(row.student_name ?? ""), roll_number: String(row.roll_number ?? ""),
      board: String(row.board ?? "BSEB"), group_name: groupNames.get(String(row.exam_group_id)) ?? "Class", subject: String(row.subject ?? ""),
      chapter_name: String(row.chapter_name ?? ""), amount_inr: Number(row.amount ?? row.amount_inr ?? 20), payer_name: String(row.payer_name ?? ""),
      paid_at: row.paid_at ?? null, status: String(row.status ?? "pending"), created_at: row.created_at ?? null,
    })) });
  } catch (error) {
    console.error("Atlas payment review list failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not load payment submissions." }, { status: 503 });
  }
}
