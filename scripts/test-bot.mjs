// Authenticated website boundaries and public output, offline with mocked VPS/Auth.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let count = 0;
async function test(name, run) {
  await run();
  console.log(`ok ${++count} - ${name}`);
}
function load(file, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in mocks, name);
      return mocks[name];
    },
    URL,
    URLSearchParams,
    Buffer,
    ReadableStream,
    AbortSignal,
    process,
    ...extra,
  });
  return exports;
}
let user = { id: "12345678-1234-4234-8234-123456789abc" },
  roles = ["admin"],
  roleError = false,
  queries = [];
const server = load(
  "src/lib/bot/server.ts",
  {
    "server-only": {},
    "@/lib/supabase/server": {
      getUser: async () => user,
      createClient: async () => ({
        from: (table) => {
          queries.push(table);
          const query = {
            select: () => query,
            eq: (key, value) => {
              queries.push([key, value]);
              return query;
            },
            limit: async () => ({
              data: roles
                .filter((r) => r === "admin")
                .map((role) => ({ role })),
              error: roleError,
            }),
          };
          return query;
        },
      }),
    },
  },
  { fetch: async () => Response.json({ available: true, entries: [] }) },
);

await test("only fresh, verified website admins get an identity", async () => {
  assert.equal(await server.botAdminIdentity(), user.id);
  assert.ok(
    queries.some(
      (q) => Array.isArray(q) && q[0] === "user_id" && q[1] === user.id,
    ),
  );
  roles = ["mod"];
  assert.equal(await server.botAdminIdentity(), null);
  roles = ["user"];
  assert.equal(await server.botAdminIdentity(), null);
  roles = ["admin"];
  roleError = true;
  assert.equal(await server.botAdminIdentity(), null);
  roleError = false;
  user = null;
  assert.equal(await server.botAdminIdentity(), null);
});
await test("VPS proxy accepts only named endpoints and methods", () => {
  for (const path of [
    "state",
    "cases",
    "cases/1",
    "tickets",
    "transcripts/12",
    "leaderboard",
  ])
    assert.ok(server.permittedBotPath(path.split("/"), "GET"));
  for (const path of [
    "../env",
    "state/../../tokens",
    "http://evil.test",
    "transcripts/-1",
    "transcripts/01",
    "actions/run-shell",
  ])
    assert.equal(server.permittedBotPath(path.split("/"), "GET"), false);
  assert.ok(server.permittedBotPath(["settings"], "PUT"));
  assert.equal(server.permittedBotPath(["settings"], "GET"), false);
  assert.equal(server.permittedBotPath(["state"], "POST"), false);
});
await test("streamed bodies are limited even without Content-Length", async () => {
  const make = () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.enqueue(new Uint8Array(100));
        controller.close();
      },
    });
  assert.equal((await server.boundedText(make(), 200)).length, 200);
  await assert.rejects(server.boundedText(make(), 199));
});

let admin = true,
  calls = [],
  reads = 0,
  revoke = false;
const edge = load("src/app/api/admin/bot/[...path]/route.ts", {
  "next/server": {
    NextResponse: { json: (data, init) => Response.json(data, init) },
  },
  "@/lib/bot/server": {
    ...server,
    botAdminIdentity: async () => (admin ? "verified-admin-id" : null),
    boundedText: async (body) => {
      reads++;
      if (revoke) admin = false;
      return server.boundedText(body);
    },
    botRequest: async (...args) => {
      calls.push(args);
      return { status: 200, data: { ok: true } };
    },
  },
});
function req(path, method = "GET", origin = "https://gdmacros.com", body = {}) {
  const request = new Request(`https://gdmacros.com/api/admin/bot/${path}`, {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  request.nextUrl = new URL(request.url);
  return request;
}
const context = (p) => ({ params: Promise.resolve({ path: p.split("/") }) });
function reset() {
  admin = true;
  calls = [];
  reads = 0;
  revoke = false;
}
await test("mods, users and signed-out visitors cannot read transcripts or mutate settings", async () => {
  reset();
  admin = false;
  for (const path of ["state", "cases", "tickets", "transcripts/1"])
    assert.equal((await edge.GET(req(path), context(path))).status, 403);
  assert.equal(
    (await edge.PUT(req("settings", "PUT"), context("settings"))).status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.equal(reads, 0);
});
await test("mutations reject cross-origin and absent Origin", async () => {
  reset();
  for (const origin of ["https://evil.test", null])
    assert.equal(
      (await edge.PUT(req("settings", "PUT", origin), context("settings")))
        .status,
      403,
    );
  assert.equal(calls.length, 0);
});
await test("revocation while reading an import stops the VPS write", async () => {
  reset();
  revoke = true;
  assert.equal(
    (await edge.POST(req("import", "POST"), context("import"))).status,
    403,
  );
  assert.equal(calls.length, 0);
});
await test("allowed admin reads are never cached and query parameters are filtered", async () => {
  reset();
  const response = await edge.GET(
    req("cases?page=2&token=never-forward&target=123"),
    context("cases"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(calls[0][0], "cases?page=2&target=123");
  assert.equal(calls[0][1], "verified-admin-id");
});
await test("unknown remote operations are rejected before contacting the service", async () => {
  reset();
  assert.equal(
    (
      await edge.POST(
        req("actions/run-shell", "POST"),
        context("actions/run-shell"),
      )
    ).status,
    404,
  );
  assert.equal(calls.length, 0);
});
const board = load("src/lib/bot/leaderboard.ts", {});
await test("public leaderboard strips extra fields, unsafe avatars and private records", () => {
  const row = {
    position: 1,
    user_id: "100000000000000001",
    username: "Member",
    avatar: "https://private.test/token",
    xp: 123,
    level: 1,
    messages: 10,
    progress: 0.2,
    email: "private",
    cases: [],
    token: "secret",
    transcript: "private",
  };
  const data = board.publicLeaderboard(
    { available: true, total: 1, entries: [row] },
    1,
  );
  assert.equal(data.entries[0].avatar, null);
  assert.deepEqual(
    Object.keys(data.entries[0]).sort(),
    [
      "position",
      "user_id",
      "username",
      "avatar",
      "xp",
      "messages",
      "level",
      "progress",
    ].sort(),
  );
  for (const invalid of [
    { ...row, user_id: "invalid" },
    { ...row, xp: Infinity },
    { ...row, xp: -1 },
  ])
    assert.equal(
      board.publicLeaderboard(
        { available: true, total: 1, entries: [invalid] },
        1,
      ).entries.length,
      0,
    );
  assert.equal(
    board.publicLeaderboard({ available: false, entries: [row] }, 1).entries
      .length,
    0,
  );
});
await test("nested dashboard and transcript pages are covered by the admin layout", () => {
  const layout = fs.readFileSync("src/app/admin/bot-panel/layout.tsx", "utf8");
  assert.match(layout, /botAdminIdentity/);
  assert.match(layout, /notFound/);
  assert.match(layout, /index: false/);
  const reader = fs.readFileSync(
    "src/components/admin/bot/TranscriptView.tsx",
    "utf8",
  );
  assert.ok(!reader.includes("dangerouslySetInnerHTML"));
  assert.match(reader, /cdn\.discordapp\.com/);
  assert.match(reader, /no-referrer/);
});
console.log(`${count} bot website boundary tests passed`);
