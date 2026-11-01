import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
import { getStudentSession } from "@/lib/server/student-session";

type Context = { params: Promise<{ examId: string }> };

async function loadStudentExam(request: NextRequest, examId: string) {
  const session = getStudentSession(request);
  if (!session) return { response: NextResponse.json({ error: "Student session required." }, { status: 401 }) };
  const db = await getMongoDb();
  const assignment = await db.collection("examGroupAssignments").findOne({ exam_id: examId, exam_group_id: session.groupId });
  const exam = assignment ? await db.collection("exams").findOne({ _id: examId, published: true }) : null;
  const student = await db.collection("students").findOne({ exam_group_id: session.groupId, roll_number: session.rollNumber });
  if (!exam || !student) return { response: NextResponse.json({ error: "This examination is not assigned to this student." }, { status: 404 }) };
  const studentId = String(student.id ?? student._id);
  const previousPayment = await db.collection("examPaymentSubmissions").find({ exam_id: examId, student_id: studentId }).sort({ created_at: -1 }).limit(1).next();
  return { db, session, exam, student, studentId, previousPayment };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { examId } = await context.params;
    const data = await loadStudentExam(request, examId);
    if ("response" in data) return data.response;
    const token = new URL(request.url).searchParams.get("token");
    const payment = token ? await data.db.collection("examPaymentSubmissions").findOne({ status_token: token, exam_id: examId, student_id: data.studentId }) : data.previousPayment;
    return NextResponse.json({
      student: { fullName: data.session.fullName, rollNumber: data.session.rollNumber, board: data.session.board, className: data.session.className },
      exam: { id: examId, title: data.exam.title, subject: data.exam.subject, chapter: data.exam.chapter_name, durationSeconds: data.exam.duration_seconds },
      payment: payment ? {
        status: payment.status,
        statusToken: payment.status_token,
        payerName: payment.payer_name,
        paidAt: payment.paid_at,
        method: payment.payment_method === "cash" ? "cash" : "online",
      } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Atlas payment details failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Could not load exam payment details." }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  const session = getStudentSession(request);
  if (!session) return NextResponse.json({ error: "Student session required." }, { status: 401 });
  let body: { payerName?: string; paidAt?: string; paymentMethod?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter payer name and payment date/time." }, { status: 400 }); }
  const payerName = body.payerName?.trim() ?? "";
  const paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (!["cash", "online"].includes(body.paymentMethod ?? "") || payerName.length < 2 || payerName.length > 120 || !paidAt || Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 5 * 60_000) {
    return NextResponse.json({ error: "Enter a valid payer name and payment date/time." }, { status: 400 });
  }
  const paymentMethod = body.paymentMethod as "cash" | "online";
  try {
    const { examId } = await context.params;
    const data = await loadStudentExam(request, examId);
    if ("response" in data) return data.response;
    const now = new Date();
    const token = randomUUID();
    if (data.previousPayment) {
      if (data.previousPayment.status === "verified") {
        return NextResponse.json({
          status: "verified",
          statusToken: data.previousPayment.status_token ?? token,
        }, { status: 200 });
      }
      await data.db.collection("examPaymentSubmissions").updateOne(
        { _id: data.previousPayment._id },
        {
          $set: {
            payer_name: payerName,
            paid_at: paidAt,
            payment_method: paymentMethod,
            status: "pending",
            updated_at: now,
          },
          $unset: { reviewed_by: "", reviewed_at: "" },
        }
      );
      return NextResponse.json({ status: "pending", statusToken: data.previousPayment.status_token ?? token }, { status: 200 });
    }
    await data.db.collection("examPaymentSubmissions").insertOne({
      _id: `exam-payment:${token}`, id: `exam-payment:${token}`, status_token: token,
      exam_id: examId, student_id: data.studentId, profile_id: String(data.student.profile_id),
      exam_group_id: session.groupId, roll_number: session.rollNumber, student_name: session.fullName,
      board: session.board, subject: String(data.exam.subject), chapter_name: String(data.exam.chapter_name ?? ""),
      payer_name: payerName, paid_at: paidAt, payment_method: paymentMethod, amount: 20, status: "pending",
      created_at: now,
    });
    return NextResponse.json({ status: "pending", statusToken: token }, { status: 201 });
  } catch (error) {
    console.error("Atlas payment submission failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Payment details could not be submitted. Please try again shortly." }, { status: 503 });
  }
}
