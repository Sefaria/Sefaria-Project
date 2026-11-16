#!/usr/bin/env node
// Fails unless @sefaria/design-system is a released version, the way it will be installed:
// - package.json pins a release tag: github:Sefaria/design-system#vX.Y.Z;
// - package-lock.json resolves that tag's commit (npm ci installs the lockfile's commit, whatever
//   package.json says);
// - with DESIGN_SYSTEM_BASE=<git ref> (CI: the PR's base branch), the version isn't older than the
//   base's, so a branch can't merge a downgrade.
// A branch may point at an unreleased design-system commit while trying it out, but can't merge that way.
// The same script is in Sefaria/Sefaria-Project (build/ci/) and Sefaria/ai-chatbot (scripts/).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NAME = '@sefaria/design-system';
const REPO = 'https://github.com/Sefaria/design-system';
const TAG_SPEC = /^github:Sefaria\/design-system#(v(\d+)\.(\d+)\.(\d+))$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const tagOf = (packageJson) => JSON.parse(packageJson).dependencies?.[NAME]?.match(TAG_SPEC);

const spec = JSON.parse(readFileSync('package.json', 'utf8')).dependencies?.[NAME];
const pinned = tagOf(readFileSync('package.json', 'utf8'));
if (!pinned) {
  fail(`${NAME} is "${spec}". Pin it to a release before merging:\n  npm install github:Sefaria/design-system#vX.Y.Z`);
}
const tag = pinned[1];

// The commit the tag points at (an annotated tag's ^{} line, if any, is the commit).
let remote;
try {
  remote = execFileSync('git', ['ls-remote', REPO, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  fail(`Couldn't reach ${REPO} to read tag ${tag}: ${String(error.stderr || error.message).trim()}`);
}
const lines = remote.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
const tagCommit = (lines.find(([, ref]) => ref.endsWith('^{}')) || lines[0])?.[0];
if (!tagCommit) fail(`${NAME} is pinned to ${tag}, but ${REPO} has no such tag.`);

const locked = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages?.[`node_modules/${NAME}`]?.resolved;
const lockedCommit = locked?.split('#')[1];
if (lockedCommit !== tagCommit) {
  fail(
    `package-lock.json installs ${NAME} at ${lockedCommit || '(nothing)'}, but ${tag} is ${tagCommit}.\n` +
      `Update the lockfile: npm install github:Sefaria/design-system#${tag}`,
  );
}

const base = process.env.DESIGN_SYSTEM_BASE;
if (base) {
  let basePackageJson;
  try {
    basePackageJson = execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' });
  } catch {
    fail(`Couldn't read package.json at ${base} to compare design-system versions.`);
  }
  const basePinned = tagOf(basePackageJson);
  if (basePinned) {
    const older = [2, 3, 4].map((i) => Number(pinned[i]) - Number(basePinned[i])).find((d) => d !== 0) < 0;
    if (older) fail(`${NAME} is ${tag}, older than ${basePinned[1]} on the base branch. Update it before merging.`);
  }
}

console.log(`${NAME} is pinned to ${tag} (${tagCommit.slice(0, 7)}), and the lockfile installs that commit.`);
