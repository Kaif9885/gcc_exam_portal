import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*(MONGODB_URI|MONGODB_DB)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch { /* Environment variables may already be supplied by the shell. */ }

const uri = process.env.MONGODB_URI;
if (!uri || /YOUR_|USERNAME|PASSWORD|YOUR_CLUSTER/i.test(uri)) {
  console.error("MONGODB_URI is missing or still contains template text. Check .env.local.");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 1 });
try {
  await client.connect();
  await client.db(process.env.MONGODB_DB || "glorious_exams").command({ ping: 1 });
  console.log("Atlas connection successful (ping passed).");
} catch (error) {
  const issues = [];
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const item = current;
    issues.push([item.name, item.code, item.syscall, item.message].filter(Boolean).join(" "));
    current = item.cause;
  }
  const serverErrors = error?.reason?.servers;
  if (serverErrors instanceof Map) {
    for (const server of serverErrors.values()) {
      if (server.error) issues.push([server.error.name, server.error.code, server.error.syscall, server.error.message].filter(Boolean).join(" "));
    }
  }
  const message = issues.join(" ");
  if (/querySrv|ENOTFOUND|EAI_AGAIN|ENODATA/i.test(message)) {
    console.error("Atlas SRV hostname could not be resolved. Copy the hostname from Atlas → Connect → Drivers; check DNS/network access.");
  } else if (/authentication failed|bad auth|code 18/i.test(message)) {
    console.error("Atlas rejected the database username/password. Reset the Database Access user's password and update .env.local.");
  } else if (/timed out|timeout|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(message)) {
    console.error("Atlas connection timed out. Add this computer's current public IP under Atlas → Network Access.");
  } else if (/MongoParseError|Invalid scheme|URI malformed/i.test(message)) {
    console.error("MongoDB URI format is invalid. Copy the Node.js driver URI from Atlas and replace its placeholders.");
  } else if (/not authorized|Unauthorized/i.test(message)) {
    console.error("Database user authenticated but lacks access. Grant readWrite on the glorious_exams database.");
  } else {
    const safeDetails = message
      .replace(/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://[credentials-redacted]@")
      .replace(/[a-z0-9.-]+\.mongodb\.net/gi, "[cluster-host]");
    console.error(`Atlas connection failed (${error instanceof Error ? error.name : "unknown error"}): ${safeDetails.slice(0, 500)}`);
  }
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
