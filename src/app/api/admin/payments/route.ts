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
    const rows = await db
      .collection("examPaymentSubmissions")
      .find({})
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();

    const payments = rows.map(row => ({
      id: String(row.id ?? row._id),
      studentName: String(row.student_name ?? "Student"),
      rollNumber: String(row.roll_number ?? "—"),
      board: String(row.board ?? "BSEB"),
      groupName: String(row.exam_group_id ?? "School"),
      subject: String(row.subject ?? "—"),
      chapterName: String(row.chapter_name ?? "—"),
      amountInr: Number(row.amount ?? 20),
      transactionReference: String(row.transaction_reference ?? "PhonePe"),
      payerUpiId: String(row.payer_upi_id ?? "—"),
      payerName: String(row.payer_name ?? "—"),
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : new Date().toISOString(),
      status: row.status === "verified" ? "verified" : row.status === "rejected" ? "rejected" : "pending",
      reviewedBy: String(row.reviewed_by ?? "—"),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    }));

    const verifiedCount = payments.filter(p => p.status === "verified").length;
    const pendingCount = payments.filter(p => p.status === "pending").length;
    const rejectedCount = payments.filter(p => p.status === "rejected").length;
    const totalAmount = payments.reduce((sum, p) => sum + (p.status === "verified" ? p.amountInr : 0), 0);

    return NextResponse.json({
      payments,
      stats: {
        total: payments.length,
        verified: verifiedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        totalAmountInr: totalAmount,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Admin payments fetch error:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not load payment submissions." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  let body: { paymentId?: string; approved?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  }

  if (!body.paymentId || typeof body.approved !== "boolean") {
    return NextResponse.json({ error: "Specify paymentId and approval decision." }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const result = await db.collection("examPaymentSubmissions").updateOne(
      { _id: body.paymentId },
      {
        $set: {
          status: body.approved ? "verified" : "rejected",
          reviewed_by: session.name,
          reviewed_at: new Date(),
        },
      }
    );

    if (!result.matchedCount) {
      return NextResponse.json({ error: "Payment submission not found." }, { status: 404 });
    }

    await db.collection("auditLogs").insertOne({
      actor_name: session.name,
      action: body.approved ? "admin_verify_payment" : "admin_reject_payment",
      object_type: "exam_payment",
      object_id: body.paymentId,
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true, status: body.approved ? "verified" : "rejected" });
  } catch (error) {
    console.error("Admin payment review failed:", error instanceof Error ? error.message : "Unknown");
    return NextResponse.json({ error: "Could not update payment status." }, { status: 503 });
  }
}

