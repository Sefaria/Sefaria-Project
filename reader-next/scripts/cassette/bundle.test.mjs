// node --test scripts/cassette/bundle.test.mjs — the cassette bundle round trip (pack → lock → unpack → verify), on a temporary
// cassette and lock, and CI's fallback when the pinned bundle cannot be fetched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./bundle.mjs", import.meta.url).pathname;
const run = (env, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env }, encoding: "utf8" });

const runAsync = (env, ...args) =>
  new Promise((done) => execFile(process.execPath, [SCRIPT, ...args], { env: { ...process.env, ...env }, encoding: "utf8" }, (error, stdout, stderr) => done({ code: error?.code ?? 0, stdout, stderr })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cassette-test-"));
  const dir = join(root, "cassette");
  mkdirSync(dir);
  for (const [name, body] of [["a1", "GET /api/a"], ["b2", "GET /api/b"]]) writeFileSync(join(dir, `${name}.gz`), gzipSync(Buffer.from(body)));
  return { root, dir, env: { E2E_CASSETTE_DIR: dir, E2E_CASSETTE_LOCK: join(root, "cassette.lock") } };
}

test("pack pins the content hash; unpack restores exactly that and refuses anything else", () => {
  const { root, dir, env } = fixture();
  const packed = run(env, "pack", "--out", join(root, "out"));
  assert.equal(packed.status, 0, packed.stderr);
  const lock = JSON.parse(readFileSync(env.E2E_CASSETTE_LOCK, "utf8"));
  assert.match(lock.hash, /^[0-9a-f]{64}$/);
  assert.equal(lock.files, 2);
  assert.equal(lock.asset, `reader-next-e2e-cassette-${lock.hash.slice(0, 16)}.tar.gz`);
  assert.equal(lock.url, `https://github.com/Sefaria/Sefaria-Project/releases/download/reader-next-e2e-cassette/${lock.asset}`);
  const bundle = join(root, "out", lock.asset);
  assert.equal(run(env, "verify").status, 0);

  // a changed recording: verify fails; unpacking the pinned bundle puts the recorded set back
  writeFileSync(join(dir, "a1.gz"), gzipSync(Buffer.from("changed")));
  writeFileSync(join(dir, "extra.gz"), gzipSync(Buffer.from("extra")));
  assert.equal(run(env, "verify").status, 1);
  assert.equal(run(env, "unpack", bundle).status, 0);
  assert.deepEqual(readdirSync(dir).sort(), ["a1.gz", "b2.gz"]);
  assert.equal(run(env, "verify").status, 0);

  // a bundle that is not the pinned one is refused, and the cassette is left as it was
  const other = join(root, "other");
  mkdirSync(join(other, "c"), { recursive: true });
  writeFileSync(join(other, "c", "z.gz"), gzipSync(Buffer.from("z")));
  execFileSync("tar", ["-czf", join(other, "other.tar.gz"), "-C", join(other, "c"), "z.gz"]);
  const refused = run(env, "unpack", join(other, "other.tar.gz"));
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /the lock pins/);
  assert.deepEqual(readdirSync(dir).sort(), ["a1.gz", "b2.gz"]);
});

// CI 2026-11-10: a bundle packed by macOS tar carries a hidden "._<name>.gz" AppleDouble entry per file; GNU tar unpacks them as files
// (macOS tar itself treats a "._" file as metadata when extracting, so this checks the directory Linux ends up with directly.)
test("macOS metadata entries (._*.gz) unpacked on Linux are not recordings: the pinned hash still matches", async () => {
  const { root, dir, env } = fixture();
  assert.equal(run(env, "pack", "--out", join(root, "out")).status, 0);
  const lock = JSON.parse(readFileSync(env.E2E_CASSETTE_LOCK, "utf8"));
  // what GNU tar leaves from a Mac-packed bundle: the two recordings plus their AppleDouble entries as ordinary files
  const linux = join(root, "linux");
  mkdirSync(linux);
  for (const f of ["a1.gz", "b2.gz"]) {
    writeFileSync(join(linux, f), readFileSync(join(dir, f)));
    writeFileSync(join(linux, `._${f}`), Buffer.from("\x00\x05\x16\x07 AppleDouble"));
  }
  const { hashDir } = await import(SCRIPT);
  const got = hashDir(linux);
  assert.equal(got.files, 2);
  assert.equal(got.hash, lock.hash);
});

test("fetch replays the pinned bundle, and falls back to auto when it is missing or not the pinned one", async () => {
  const { root, dir, env } = fixture();
  assert.equal(run(env, "pack", "--out", join(root, "out")).status, 0);
  const lock = JSON.parse(readFileSync(env.E2E_CASSETTE_LOCK, "utf8"));
  const server = createServer((req, res) => {
    const file = join(root, "out", req.url.slice(1));
    if (req.url.slice(1) !== lock.asset && req.url !== "/wrong.tar.gz") return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "application/gzip" }).end(readFileSync(req.url === "/wrong.tar.gz" ? join(root, "wrong.tar.gz") : file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    writeFileSync(join(dir, "a1.gz"), gzipSync(Buffer.from("changed locally")));
    const ok = await runAsync({ ...env, E2E_CASSETTE_URL: `${base}/${lock.asset}` }, "fetch");
    assert.match(ok.stdout, /mode=replay$/m);
    assert.equal(run(env, "verify").status, 0); // the local change was replaced by the pinned recordings

    execFileSync("tar", ["-czf", join(root, "wrong.tar.gz"), "-C", dir, "a1.gz"]);
    const wrong = await runAsync({ ...env, E2E_CASSETTE_URL: `${base}/wrong.tar.gz` }, "fetch");
    assert.match(wrong.stdout, /::warning title=e2e cassette::.*the lock pins/);
    assert.match(wrong.stdout, /mode=auto$/m);

    const missing = await runAsync({ ...env, E2E_CASSETTE_URL: `${base}/absent.tar.gz` }, "fetch");
    assert.match(missing.stdout, /::warning title=e2e cassette::.*404/);
    assert.match(missing.stdout, /mode=auto$/m);

    // on a push (--strict) a pinned bundle that cannot be used fails the step, and says no mode
    const strict = await runAsync({ ...env, E2E_CASSETTE_URL: `${base}/absent.tar.gz` }, "fetch", "--strict");
    assert.equal(strict.code, 1);
    assert.match(strict.stdout, /::error title=e2e cassette::.*404/);
    assert.doesNotMatch(strict.stdout, /mode=/);
    const strictOk = await runAsync({ ...env, E2E_CASSETTE_URL: `${base}/${lock.asset}` }, "fetch", "--strict");
    assert.equal(strictOk.code, 0);
    assert.match(strictOk.stdout, /mode=replay$/m);
  } finally {
    server.close();
  }
  const noLock = run({ ...env, E2E_CASSETTE_LOCK: join(root, "absent.lock") }, "fetch", "--strict");
  assert.equal(noLock.status, 0); // no lock: nothing is pinned yet, even on a push
  assert.match(noLock.stdout, /::warning title=e2e cassette::no /);
  assert.match(noLock.stdout, /mode=auto$/m);
});
