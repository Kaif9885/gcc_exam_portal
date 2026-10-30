import { type Collection, type Db, type Document, MongoClient } from "mongodb";
import { ensureMongoSchema } from "@/lib/server/mongo-schema";

export type SchoolDoc = Document & { _id?: string };
export type SchoolDb = Omit<Db, "collection"> & {
  collection: <TSchema extends Document = SchoolDoc>(name: string) => Collection<TSchema>;
};

type MongoCache = { client: MongoClient | null; promise: Promise<MongoClient> | null; dbPromise: Promise<SchoolDb> | null; uri?: string };
const globalForMongo = globalThis as typeof globalThis & { __schoolMongo?: MongoCache };
const cache = globalForMongo.__schoolMongo ?? { client: null, promise: null, dbPromise: null };
globalForMongo.__schoolMongo = cache;

export async function getMongoDb(): Promise<SchoolDb> {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB || "glorious_exams";
  if (!uri) throw new Error("MONGODB_URI is not configured. Add your MongoDB Atlas connection string to .env.local.");
  if (cache.uri !== uri) {
    const previousClient = cache.client;
    cache.uri = uri;
    cache.client = null;
    cache.promise = null;
    cache.dbPromise = null;
    if (previousClient) void previousClient.close().catch(() => undefined);
  }
  if (!cache.promise) {
    const client = new MongoClient(uri, { maxPoolSize: 50, serverSelectionTimeoutMS: 10_000 });
    const connection = client.connect().then(connected => {
      if (cache.uri === uri && cache.promise === connection) cache.client = connected;
      else void connected.close().catch(() => undefined);
      return connected;
    }).catch(error => {
      if (cache.uri === uri && cache.promise === connection) {
        cache.promise = null;
        cache.dbPromise = null;
      }
      throw error;
    });
    cache.promise = connection;
  }
  const client = await cache.promise;
  if (cache.uri !== uri) return getMongoDb();
  if (!cache.dbPromise) {
    const databasePromise = (async () => {
      const db = client.db(databaseName);
      await ensureMongoSchema(db);
      return db;
    })().catch(error => {
      if (cache.uri === uri && cache.dbPromise === databasePromise) cache.dbPromise = null;
      throw error;
    });
    cache.dbPromise = databasePromise;
  }
  return cache.dbPromise;
}
