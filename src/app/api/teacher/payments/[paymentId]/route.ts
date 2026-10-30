import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getTeacherSession } from "@/lib/server/teacher-session";

export async function POST(request: NextRequest, context: { params: Promise<{ paymentId: string }> }) {
  const teacher = getTeacherSession(request);
  if (!teacher) return NextResponse.json({ error: "Teacher session required." }, { status: 401 });
  let body: { approved?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Choose verify or reject." }, { status: 400 }); }
  if (typeof body.approved !== "boolean") return NextResponse.json({ error: "Choose verify or reject." }, { status: 400 });
  try {
    const { paymentId } = await context.params;
    const db = await getMongoDb();
    const result = await db.collection("examPaymentSubmissions").updateOne({ _id: paymentId, status: "pending" }, {
      $set: { status: body.approved ? "verified" : "rejected", reviewed_by: teacher.name, reviewed_at: new Date() },
    });
    if (!result.matchedCount) return NextResponse.json({ error: "This payment was already reviewed or could not be found." }, { status: 404 });
    await db.collection("auditLogs").insertOne({ actor_name: teacher.name, action: body.approved ? "verify_exam_payment" : "reject_exam_payment", object_type: "exam_payment", object_id: paymentId, created_at: new Date() });
    return NextResponse.json({ ok: true, status: body.approved ? "verified" : "rejected" });
  } catch (error) {
    console.error("Atlas payment decision failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not save the payment decision." }, { status: 503 });
  }
}
