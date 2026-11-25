import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { createSyncServer } from "../server/sync";
import { blankState } from "../src/study";

const key = "01".repeat(32);
const canonical = "https://piensa.musel.dev";
const legacy = "https://math.musel.dev";
const local = "http://localhost:4173";
const route = "/api/progress";

async function fixture(t: TestContext, allowedOrigins: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "piensa-sync-test-"));
  const keyHashFile = join(directory, "key.sha256");
  const dataFile = join(directory, "progress.json");
  await writeFile(keyHashFile, createHash("sha256").update(key).digest("hex") + "\n");
  const servers = new Set<Server>();
  t.after(async () => {
    await Promise.all([...servers].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await rm(directory, { recursive: true, force: true });
  });
  async function start() {
    const server = await createSyncServer({ keyHashFile, dataFile, allowedOrigins });
    const listening = once(server, "listening");
    server.listen(0, "127.0.0.1");
    await listening;
    servers.add(server);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return {
      url: "http://127.0.0.1:" + address.port,
      async close() {
        await new Promise<void>(resolve => server.close(() => resolve()));
        servers.delete(server);
      },
    };
  }
  return { dataFile, keyHashFile, start, ...await start() };
}

function signIn(url: string, { origin = canonical, path = route, accountKey = key } = {}) {
  return fetch(url + path + "/session", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ key: accountKey }),
  });
}

async function signInCookie(url: string) {
  const response = await signIn(url);
  assert.equal(response.status, 204);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

function save(url: string, cookie: string, revision: number, state: unknown) {
  return fetch(url + route, {
    method: "PUT", headers: { Origin: canonical, "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ revision, state }),
  });
}

test("sync requires a valid session and sets a host-only secure cookie scoped to the API", async t => {
  const fixtureData = await fixture(t);
  const { url } = fixtureData;
  const unauthenticated = await fetch(url + route);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("cache-control"), "no-store");
  assert.equal((await save(url, "piensa_sync=unknown", 0, blankState())).status, 401);
  for (const accountKey of ["nope", "gf".repeat(32), "ff".repeat(32)]) {
    const denied = await signIn(url, { accountKey });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("set-cookie"), null);
  }

  const signedIn = await signIn(url);
  assert.equal(signedIn.status, 204);
  const cookie = signedIn.headers.get("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, /; Path=\/api\/progress(?:;|$)/);
  assert.match(cookie, /; HttpOnly(?:;|$)/);
  assert.match(cookie, /; Secure(?:;|$)/);
  assert.match(cookie, /; SameSite=Strict(?:;|$)/);
  assert.doesNotMatch(cookie, /; Domain=/i);
  const auth = cookie.split(";")[0];
  const response = await fetch(url + route, { headers: { Cookie: "other=foo; " + auth } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { revision: 0, state: null });
  assert.equal((await fetch(url + route, { headers: { Cookie: auth + "; " + auth } })).status, 401);

  const signedOut = await fetch(url + route + "/session", {
    method: "DELETE", headers: { Origin: canonical, Cookie: auth },
  });
  assert.equal(signedOut.status, 204);
  assert.match(signedOut.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await fetch(url + route, { headers: { Cookie: auth } })).status, 401);
});

test("mutations require the exact origin for the public route or an explicitly configured origin", async t => {
  const { url } = await fixture(t, [local]);
  for (const origin of [legacy, canonical + ".invalid", canonical + "/"]) {
    assert.equal((await signIn(url, { origin })).status, 403);
  }
  assert.equal((await fetch(url + route + "/session", { method: "POST" })).status, 403);
  assert.equal((await signIn(url, { origin: local })).status, 204);
  const response = await signIn(url, { origin: legacy, path: "/piensa" + route });
  assert.equal(response.status, 204);
  const legacyCookie = response.headers.get("set-cookie");
  assert.ok(legacyCookie);
  assert.match(legacyCookie, /; Path=\/piensa\/api\/progress(?:;|$)/);
  assert.equal((await signIn(url, { origin: canonical, path: "/piensa" + route })).status, 403);
  const legacyAuth = legacyCookie.split(";")[0];
  assert.equal((await fetch(url + route, { headers: { Cookie: legacyAuth } })).status, 401);
  assert.equal((await fetch(url + "/piensa" + route, { headers: { Cookie: legacyAuth } })).status, 200);

  const cookie = await signInCookie(url);
  const denied = await fetch(url + route + "/session", { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(denied.status, 403);
  assert.equal((await fetch(url + route, { headers: { Cookie: cookie } })).status, 200);
});

test("only one write wins at a revision, stale writes leave it intact, and restart keeps progress", async t => {
  const { dataFile, start, url, close } = await fixture(t);
  const cookie = await signInCookie(url);
  const first = blankState("2026-11-24");
  const second = blankState("2026-11-25");
  const responses = await Promise.all([save(url, cookie, 0, first), save(url, cookie, 0, second)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const accepted = responses.findIndex(response => response.status === 200);
  const saved = { revision: 1, state: accepted === 0 ? first : second };
  assert.deepEqual(await responses[accepted].json(), saved);
  assert.deepEqual(JSON.parse(await readFile(dataFile, "utf8")), saved);
  assert.equal((await save(url, cookie, 0, blankState("2026-11-26"))).status, 409);
  await close();

  const restarted = await start();
  const freshCookie = await signInCookie(restarted.url);
  const response = await fetch(restarted.url + route, { headers: { Cookie: freshCookie } });
  assert.deepEqual(await response.json(), saved);
  const updated = await save(restarted.url, freshCookie, 1, second);
  assert.deepEqual(await updated.json(), { revision: 2, state: second });
});

test("a failed atomic write leaves the revision unchanged and permits retry", async t => {
  const { dataFile, url } = await fixture(t);
  const cookie = await signInCookie(url);
  const state = blankState("2026-11-25");
  // A directory in place of the data file forces the rename to fail.
  await mkdir(dataFile);
  assert.equal((await save(url, cookie, 0, state)).status, 500);
  assert.ok(!(await readdir(dirname(dataFile))).some(file => file.endsWith(".tmp")));
  const unchanged = await fetch(url + route, { headers: { Cookie: cookie } });
  assert.deepEqual(await unchanged.json(), { revision: 0, state: null });

  await rm(dataFile, { recursive: true });
  assert.deepEqual(await (await save(url, cookie, 0, state)).json(), { revision: 1, state });
});

test("malformed, unsupported, and oversized updates cannot mutate progress", async t => {
  const { url } = await fixture(t);
  const cookie = await signInCookie(url);
  const headers = { Origin: canonical, Cookie: cookie, "Content-Type": "application/json" };
  for (const body of ["{", "null", "{}", JSON.stringify({ revision: -1, state: blankState() })]) {
    const response = await fetch(url + route, { method: "PUT", headers, body });
    assert.equal(response.status, 400);
  }
  assert.equal((await save(url, cookie, 0, { version: 1 })).status, 400);
  assert.equal((await fetch(url + route, { method: "PUT", headers: { ...headers, "Content-Type": "text/plain" }, body: "{}" })).status, 415);
  assert.equal((await fetch(url + route, { method: "PUT", headers, body: " ".repeat(12_001_000) })).status, 413);
  assert.equal((await fetch(url + route, { method: "PATCH", headers, body: "{}" })).status, 405);
  assert.equal((await fetch(url + route + "/unknown", { headers })).status, 404);
  const response = await fetch(url + route, { headers });
  assert.deepEqual(await response.json(), { revision: 0, state: null });
});

const password = "Un-plan-privado-26";

function requestSession(url: string, method: string, payload: object, headers: Record<string, string> = {}) {
  return fetch(url + route + "/session", {
    method,
    headers: { Origin: canonical, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

test("username and password verify the exact account and accept the activation key", async t => {
  const { url } = await fixture(t);
  for (const payload of [{ username: "otra", password: key }, { username: "marie", password }, { password: key }]) {
    const denied = await requestSession(url, "POST", payload);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("set-cookie"), null);
  }
  const accepted = await requestSession(url, "POST", { username: "marie", password: key });
  assert.equal(accepted.status, 204);
  assert.match(accepted.headers.get("set-cookie") ?? "", /; HttpOnly;/);
});

test("changing the password verifies the current credential and persists privately across restart", async t => {
  const { url, dataFile, close, start } = await fixture(t);
  const cookie = await signInCookie(url);
  const otherCookie = await signInCookie(url);
  const saved = blankState("2026-11-24");
  assert.equal((await save(url, cookie, 0, saved)).status, 200);
  assert.equal((await requestSession(url, "PUT", { currentPassword: key, password })).status, 401);
  assert.equal((await requestSession(url, "PUT", { currentPassword: "wrong", password }, { Cookie: cookie })).status, 401);
  assert.equal((await requestSession(url, "PUT", { currentPassword: key, password: "too short" }, { Cookie: cookie })).status, 400);
  assert.equal((await requestSession(url, "PUT", { currentPassword: key, password }, { Cookie: cookie, Origin: legacy })).status, 403);
  const changed = await requestSession(url, "PUT", { currentPassword: key, password }, { Cookie: cookie });
  assert.equal(changed.status, 204);
  assert.equal((await fetch(url + route, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(url + route, { headers: { Cookie: otherCookie } })).status, 401);
  const stored = dataFile + ".password";
  const contents = await readFile(stored, "utf8");
  assert.equal((await stat(stored)).mode & 0o777, 0o600);
  assert.ok(!contents.includes(password) && !contents.includes(key));

  await close();
  const restarted = await start();
  const signInResponse = await requestSession(restarted.url, "POST", { username: "marie", password });
  assert.equal(signInResponse.status, 204);
  const restartedCookie = signInResponse.headers.get("set-cookie")?.split(";")[0];
  assert.ok(restartedCookie);
  const progress = await fetch(restarted.url + route, { headers: { Cookie: restartedCookie } });
  assert.deepEqual(await progress.json(), { revision: 1, state: saved });
  const recovery = await requestSession(restarted.url, "POST", { username: "marie", password: key });
  assert.equal(recovery.status, 204);

  const nextPassword = "Una-clave-nueva-26";
  assert.equal((await requestSession(restarted.url, "PUT", { currentPassword: password, password: nextPassword }, { Cookie: restartedCookie })).status, 204);
  assert.equal((await requestSession(restarted.url, "POST", { username: "marie", password })).status, 401);
  assert.equal((await requestSession(restarted.url, "POST", { username: "marie", password: nextPassword })).status, 204);
});

test("repeated wrong sign-in attempts are rate limited per verified client IP", async t => {
  const { url } = await fixture(t);
  const invalid = { username: "marie", password: "clave incorrecta" };
  for (let i = 0; i < 10; i++) {
    const failed = await requestSession(url, "POST", invalid, { "X-Real-IP": "192.0.2.23" });
    assert.equal(failed.status, 401);
  }
  const blocked = await requestSession(url, "POST", { username: "marie", password: key }, { "X-Real-IP": "192.0.2.23" });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await requestSession(url, "POST", { username: "marie", password: key }, { "X-Real-IP": "192.0.2.24" })).status, 204);
});
