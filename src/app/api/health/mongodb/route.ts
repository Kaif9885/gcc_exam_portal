import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getMongoDb();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await db.command({ ping: 1 });
        return NextResponse.json({ ok: true, database: "connected", collectionsReady: true });
      } catch (error) {
        lastError = error;
        if (/bad auth|authentication failed|code 18/i.test(error instanceof Error ? error.message : "")) throw error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
    throw lastError;
  } catch (error) {
    const missingUri = !process.env.MONGODB_URI?.trim();
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError";
    console.error("MongoDB health check failed:", message.replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://[credentials-redacted]@"));
    const badAuth = /bad auth|authentication failed|code 18/i.test(message);
    return NextResponse.json({
      ok: false,
      error: missingUri
        ? "MONGODB_URI is missing. Add the Atlas URL to .env.local, then restart the dev server."
        : badAuth
          ? "Atlas rejected the database username or password. Check Database Access credentials in .env.local."
        : "MongoDB Atlas is unreachable. Check the URI, database user/password, and Atlas Network Access IP allowlist.",
    }, { status: 503 });
  }
}
