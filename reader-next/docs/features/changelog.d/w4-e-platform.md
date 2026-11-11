### 2026-11-10 — wave 4, lane e-platform (security and exits fixes)

- **Chart: no mutable reader image.** With `nodejs.mode` `optin` or `reader`, `helm template` now refuses a reader image tagged `latest`
  (or untagged) unless `reader.allowMutableImage: true` (dev environments and cauldrons only). `legacy` renders exactly as before.
  CI: only the branch named `master` (or `prod`/`preprod`) writes those image names; `tj-actions/branch-names` pinned to v9.0.2 by
  commit, and the branch name reaches the shell through `env:` only. (security S-1, nit 1)
- **Translations server function** takes only the languages the page has and keeps a bounded cache — LIB-021. (S-2)
- **Dependencies:** seroval 1.6.11, zod 4.6.6, vite 8.3.3 (published advisories; lockfile-only patch bumps). (S-3)
- **Error beacons' rate limit** keyed on nginx's address, with a cap for everyone together — ANL-017. (S-4)
- **DEPLOYMENT.md:** the opt-in cookie is open to anyone (accepted for L0); `reader.optin.enabled: false` is the server-side kill
  switch. (S-5)
- **Exits allowlist:** `/add/…` needs `?next=`; `/admin/reset/…` only the book page's own form; `updates-about-sidebar` removed;
  `/community` and `/dedication/<slug>` cite the owner's decision; a dated entry for revision history (`/activity/<ref>/<lang>/<version>`)
  until the reader-next Django is deployed. (exits F-1, F-3, F-8)
- Dev tools: the API cassette and the dev room server listen on loopback only and the cassette no longer reflects any Origin with
  credentials; the staging relay no longer allows localhost; the vendored toolkit's local patches are listed
  (`vendor/sefaria-toolkit/LOCAL_PATCHES.md`). (nits 2, 4, 7)
