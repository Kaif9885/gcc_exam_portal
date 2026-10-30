import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { upiId: process.env.PAYMENT_UPI_ID?.trim() ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
