import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parseBackup } from "../src/study";
import type { StudyState } from "../src/types";

const productionOrigins = new Map([
  ["/api/progress", "https://piensa.musel.dev"],
  ["/piensa/api/progress", "https://math.musel.dev"],
]);
const cookieName = "piensa_sync";
const sessionSeconds = 30 * 24 * 60 * 60;
const maxSessions = 64;
const maxProgressBytes = 12_000_100;
const hexKey = /^[0-9a-f]{64}$/i;

type Snapshot = { revision: number; state: StudyState | null };
type Session = { path: string; expires: number };

interface SyncOptions {
  keyHashFile: string;
  dataFile: string;
  allowedOrigins?: readonly string[];
}

class RequestError extends Error {
  constructor(readonly status: number) { super(); }
}

function keyDigest(key: string) {
  return createHash("sha256").update(key).digest();
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revisionIsValid(revision: unknown): revision is number {
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
}

function cookieValue(header: string | undefined) {
  if (!header) return undefined;
  let found: string | undefined;
  for (const entry of header.split(";")) {
    const pair = entry.trim();
    if (!pair.startsWith(cookieName + "=")) continue;
    if (found !== undefined) return undefined;
    found = pair.slice(cookieName.length + 1);
  }
  return found && hexKey.test(found) ? found : undefined;
}

function sessionCookie(path: string, value: string, maxAge: number) {
  return `${cookieName}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function reply(response: ServerResponse, status: number, snapshot?: Snapshot) {
  if (snapshot) response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.writeHead(status).end(snapshot ? JSON.stringify(snapshot) : undefined);
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError(415);
  }
  if (Number(request.headers["content-length"]) > limit) throw new RequestError(413);

  const chunks: Buffer[] = [];
  let length = 0;
  // Leaving the iterator early must preserve the socket long enough to send a 413.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) throw new RequestError(413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
  } catch {
    throw new RequestError(400);
  }
}

async function loadSnapshot(dataFile: string): Promise<Snapshot> {
  let contents: string;
  try {
    contents = await readFile(dataFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revision: 0, state: null };
    throw error;
  }
  const record: unknown = JSON.parse(contents);
  if (!object(record) || !revisionIsValid(record.revision) || record.revision === 0 || !object(record.state)) {
    throw Error("Invalid sync data file");
  }
  return { revision: record.revision, state: parseBackup(JSON.stringify(record.state)) };
}

async function saveSnapshot(dataFile: string, snapshot: Snapshot) {
  const temporary = dataFile + "." + randomBytes(12).toString("hex") + ".tmp";
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(JSON.stringify(snapshot) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, dataFile);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function createSyncServer({ keyHashFile, dataFile, allowedOrigins = [] }: SyncOptions) {
  const digest = (await readFile(keyHashFile, "utf8")).trim();
  if (!hexKey.test(digest)) throw Error("Invalid sync key hash file");
  const expectedDigest = Buffer.from(digest, "hex");
  const extraOrigins = new Set(allowedOrigins);
  const sessions = new Map<string, Session>();
  let snapshot = await loadSnapshot(dataFile);
  let writeQueue: Promise<void> = Promise.resolve();

  function newSession(path: string) {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expires <= now) sessions.delete(token);
    }
    if (sessions.size >= maxSessions) {
      const oldest = sessions.keys().next();
      if (!oldest.done) sessions.delete(oldest.value);
    }
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { path, expires: now + sessionSeconds * 1000 });
    return token;
  }

  function saveAtRevision(revision: number, state: StudyState) {
    // Compare the revision inside the same serialized operation as the rename.
    const operation = writeQueue.then(async () => {
      if (revision !== snapshot.revision || revision === Number.MAX_SAFE_INTEGER) return { status: 409, snapshot };
      const updated = { revision: revision + 1, state };
      await saveSnapshot(dataFile, updated);
      snapshot = updated;
      return { status: 200, snapshot: updated };
    });
    writeQueue = operation.then(() => {}, () => {});
    return operation;
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const target = request.url?.split("?", 1)[0] ?? "";
    const isSession = target.endsWith("/session");
    const path = isSession ? target.slice(0, -"/session".length) : target;
    const expectedOrigin = productionOrigins.get(path);
    if (!expectedOrigin) return reply(response, 404);

    const method = request.method;
    const allowedMethods = isSession ? ["POST", "DELETE"] : ["GET", "PUT"];
    if (!method || !allowedMethods.includes(method)) {
      response.setHeader("Allow", allowedMethods.join(", "));
      return reply(response, 405);
    }
    if (method !== "GET") {
      const origin = request.headers.origin;
      if (!origin || (origin !== expectedOrigin && !extraOrigins.has(origin))) return reply(response, 403);
    }

    const token = cookieValue(request.headers.cookie);
    const session = token && sessions.get(token);
    const authenticated = session && session.path === path && session.expires > Date.now();
    if (isSession && method === "DELETE") {
      if (authenticated) sessions.delete(token);
      response.setHeader("Set-Cookie", sessionCookie(path, "", 0));
      return reply(response, 204);
    }

    if (isSession) {
      const payload = await readJson(request, 512);
      const key = object(payload) && payload.key;
      if (typeof key !== "string" || !hexKey.test(key) || !timingSafeEqual(keyDigest(key.toLowerCase()), expectedDigest)) {
        return reply(response, 401);
      }
      if (authenticated) sessions.delete(token);
      response.setHeader("Set-Cookie", sessionCookie(path, newSession(path), sessionSeconds));
      return reply(response, 204);
    }

    if (!authenticated) return reply(response, 401);
    if (method === "GET") return reply(response, 200, snapshot);
    const payload = await readJson(request, maxProgressBytes);
    if (!object(payload) || !revisionIsValid(payload.revision) || !object(payload.state)) {
      return reply(response, 400);
    }

    let state: StudyState;
    try {
      state = parseBackup(JSON.stringify(payload.state));
    } catch {
      return reply(response, 400);
    }

    const result = await saveAtRevision(payload.revision, state);
    return reply(response, result.status, result.snapshot);
  }

  return createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    void handle(request, response).catch(error => {
      request.resume();
      if (!response.headersSent) reply(response, error instanceof RequestError ? error.status : 500);
    });
  });
}

if (import.meta.main) {
  const keyHashFile = process.env.PIENSA_SYNC_KEY_HASH_FILE;
  const dataFile = process.env.PIENSA_SYNC_DATA_FILE;
  const port = Number(process.env.PIENSA_SYNC_PORT ?? 8417);
  const allowedOrigins = process.env.PIENSA_SYNC_ALLOWED_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean);
  if (!keyHashFile || !dataFile || !Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error("Invalid sync server configuration.");
    process.exitCode = 1;
  } else {
    try {
      const server = await createSyncServer({ keyHashFile, dataFile, allowedOrigins });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
    } catch {
      console.error("Could not start sync server.");
      process.exitCode = 1;
    }
  }
}
