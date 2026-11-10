// The e2e API cassette (e2e/.cassette/, scripts/api-cassette.mjs) as a versioned bundle, so CI replays exactly the recordings the
// repository pins (LAUNCH_PLAN T-A04) instead of whatever its cache holds.
//
//   node scripts/cassette/bundle.mjs hash                 the content hash of e2e/.cassette (names and bytes of every recording)
//   node scripts/cassette/bundle.mjs pack [--out <dir>]   write reader-next-e2e-cassette-<hash>.tar.gz and pin it in e2e/cassette.lock
//   node scripts/cassette/bundle.mjs unpack <file>        replace e2e/.cassette with a bundle; fails unless it matches the lock's hash
//   node scripts/cassette/bundle.mjs fetch [--strict]     CI: download the pinned bundle and unpack it; prints mode=replay, or
//                                                         mode=auto (with a warning) when there is no lock or no bundle yet.
//                                                         --strict (CI on push): a lock whose bundle cannot be used fails
//   node scripts/cassette/bundle.mjs verify               does e2e/.cassette match the lock?
//
// The hash covers the recordings, not the tarball's bytes (tar is not byte-reproducible across platforms): sha256 over the sorted lines
// "<file name> <sha256 of the file>". Bundles are GitHub release assets on one prerelease of this repository (LOCK.release); the
// lock names the asset, so a bundle is never replaced in place: a new recording set is a new asset and a new lock.
// Uses the system tar (GNU or BSD); no dependency.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HERE = new URL("../../", import.meta.url).pathname;
export const DIR = process.env.E2E_CASSETTE_DIR || join(HERE, "e2e/.cassette");
export const LOCK = process.env.E2E_CASSETTE_LOCK || join(HERE, "e2e/cassette.lock");
const REPO = process.env.E2E_CASSETTE_REPO || "Sefaria/Sefaria-Project";
const RELEASE = "reader-next-e2e-cassette";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
// macOS tar stores each file's extended attributes as a hidden AppleDouble entry "._<name>" (its own listing hides them); GNU tar on
// Linux unpacks them as ordinary files, which end in .gz too. They are never recordings: without this a bundle packed on a Mac failed
// its hash check in CI.
const recordings = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".gz") && !f.startsWith("._")).sort() : []);
/** Pack without macOS metadata entries (COPYFILE_DISABLE is read by macOS tar and ignored elsewhere). */
const TAR_ENV = { ...process.env, COPYFILE_DISABLE: "1" };

/** The content hash of a cassette directory, and its size. */
export function hashDir(dir = DIR) {
  const files = recordings(dir);
  const h = createHash("sha256");
  let bytes = 0;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    bytes += buf.length;
    h.update(`${f} ${sha256(buf)}\n`);
  }
  return { hash: h.digest("hex"), files: files.length, bytes };
}

export const assetName = (hash) => `reader-next-e2e-cassette-${hash.slice(0, 16)}.tar.gz`;
export const assetUrl = (hash, repo = REPO) => `https://github.com/${repo}/releases/download/${RELEASE}/${assetName(hash)}`;

export function readLock() {
  if (!existsSync(LOCK)) return null;
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  if (lock.format !== 1 || !/^[0-9a-f]{64}$/.test(lock.hash)) throw new Error(`${LOCK}: not a format-1 lock with a sha256 hash`);
  return lock;
}

function pack(outDir) {
  const { hash, files, bytes } = hashDir();
  if (!files) throw new Error(`${DIR} has no recordings: run the e2e suite first (E2E_API_MODE=auto records what it needs)`);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, assetName(hash));
  const list = join(mkdtempSync(join(tmpdir(), "cassette-")), "files");
  writeFileSync(list, recordings(DIR).join("\n") + "\n");
  execFileSync("tar", ["-czf", out, "-C", DIR, "-T", list], { env: TAR_ENV });
  const lock = { format: 1, hash, files, bytes, asset: assetName(hash), release: RELEASE, url: assetUrl(hash) };
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n");
  console.log(`packed ${files} recordings (${(bytes / 1e6).toFixed(1)} MB) into ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
  console.log(`pinned in ${LOCK}. Upload it once (needs write access to ${REPO}):`);
  console.log(`  gh release view ${RELEASE} -R ${REPO} >/dev/null 2>&1 || gh release create ${RELEASE} -R ${REPO} --prerelease --title "reader-next e2e API cassette" --notes "Recorded public API answers for reader-next's e2e suite (scripts/cassette/bundle.mjs). Assets are pinned by reader-next/e2e/cassette.lock; never replace one in place."`);
  console.log(`  gh release upload ${RELEASE} -R ${REPO} ${out}`);
  return out;
}

/** Replace the cassette directory with a bundle's recordings and check them against `expected` (a hash). */
function unpack(file, expected) {
  const staging = mkdtempSync(join(tmpdir(), "cassette-unpack-"));
  execFileSync("tar", ["-xzf", resolve(file), "-C", staging]);
  const got = hashDir(staging);
  if (expected && got.hash !== expected) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`bundle ${file} holds ${got.hash}, the lock pins ${expected}`);
  }
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  for (const f of recordings(staging)) writeFileSync(join(DIR, f), readFileSync(join(staging, f)));
  rmSync(staging, { recursive: true, force: true });
  return got;
}

/**
 * CI: the pinned bundle, or today's fallback (cache + auto), saying which with mode=…. With `strict` (pushes), a lock whose bundle
 * cannot be fetched or does not match is an error: the branch's e2e would otherwise quietly stop being deterministic.
 */
async function fetchPinned(strict = false) {
  const output = (mode) => {
    console.log(`mode=${mode}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
  };
  const lock = readLock();
  if (!lock) {
    console.log(`::warning title=e2e cassette::no ${LOCK}: the cassette comes from the CI cache and missing answers are recorded (auto)`);
    return output("auto");
  }
  const url = process.env.E2E_CASSETTE_URL || lock.url || assetUrl(lock.hash);
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const tmp = join(mkdtempSync(join(tmpdir(), "cassette-dl-")), lock.asset || assetName(lock.hash));
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    const got = unpack(tmp, lock.hash);
    console.log(`unpacked ${got.files} recordings from ${url} (hash ${lock.hash.slice(0, 16)})`);
    return output("replay");
  } catch (e) {
    if (strict) {
      console.log(`::error title=e2e cassette::the pinned bundle could not be used (${url}: ${e.message}). Upload it (scripts/cassette/bundle.mjs pack prints how) or fix e2e/cassette.lock`);
      process.exitCode = 1;
      return;
    }
    // a pull request keeps today's behaviour, with a warning
    console.log(`::warning title=e2e cassette::the pinned bundle could not be used (${url}: ${e.message}); falling back to the CI cache and E2E_API_MODE=auto`);
    return output("auto");
  }
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  try {
    if (cmd === "hash") {
      const { hash, files, bytes } = hashDir();
      console.log(`${hash} ${files} recordings ${bytes} bytes`);
    } else if (cmd === "pack") {
      const i = args.indexOf("--out");
      pack(i >= 0 ? resolve(args[i + 1]) : tmpdir());
    } else if (cmd === "unpack") {
      if (!args[0]) throw new Error("unpack <bundle.tar.gz>");
      const got = unpack(args[0], readLock()?.hash);
      console.log(`unpacked ${got.files} recordings into ${DIR}`);
    } else if (cmd === "fetch") {
      await fetchPinned(args.includes("--strict"));
    } else if (cmd === "verify") {
      const lock = readLock();
      const { hash } = hashDir();
      if (!lock) throw new Error(`no ${LOCK}`);
      if (hash !== lock.hash) throw new Error(`${DIR} is ${hash}, the lock pins ${lock.hash}`);
      console.log(`e2e/.cassette matches the lock (${lock.files} recordings)`);
    } else {
      console.error("usage: bundle.mjs hash | pack [--out <dir>] | unpack <file> | fetch | verify");
      process.exit(2);
    }
  } catch (e) {
    console.error(`cassette bundle: ${e.message}`);
    process.exit(1);
  }
}
