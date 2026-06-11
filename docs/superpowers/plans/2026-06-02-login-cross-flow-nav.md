# Login Page Cross-Flow Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the path to registration discoverable on the `/login` page by moving the cross-flow link directly under the title and restyling it as an underlined sefaria-blue link, in EN and HE (SC-44545).

**Architecture:** Extract the cross-flow nav line into a reusable Django `{% include %}` partial, include it under the `<h1>` in `login.html`, remove the old bottom link, and add scoped global CSS in `static/css/static.css` using general CSS custom properties from `color-palette.css`. The login page stays server-rendered (`CustomLoginView` → `LoginView`); no React, no auth-flow changes. SC-44544 (backend auto-enrollment) is kept in mind via the reusable partial seam but is **not** implemented here.

**Tech Stack:** Django 6.0.4 templates, global CSS (`static/css/static.css` + `color-palette.css` vars; no global PostCSS — PostCSS is CSS-modules-only for the React bundle), Playwright E2E (`e2e-tests/`).

**Spec:** `docs/superpowers/specs/2026-06-02-login-cross-flow-nav-design.md`

**Branch:** `feature/sc-44545/update-login-page-to-handle-anon-la-candidates` (already checked out)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `templates/registration/_cross_flow_nav.html` | **New.** Presentational partial: prompt text + inline link, EN/HE, with optional `?next=`. Reusable by login now, register later (SC-44544). |
| `templates/registration/login.html` | **Modify.** Include the partial under `<h1>`; remove the old bottom "Create a new account" link. |
| `static/css/static.css` | **Modify.** Add scoped `.registration-prompt` rule (Figma `35:430` values via general vars). |
| `e2e-tests/mobile web/auth-flow.spec.ts` | **Modify.** Test HAM-A003 selects the removed link text — update to the new "Sign Up" link. |

---

## Task 1: Update the E2E test to expect the new link (failing first)

The only automated guard on this UI is Playwright test **HAM-A003**, which currently finds the link
by the old text `/Create a new account/i`. Update it first so it expresses the target behavior and
fails against current code.

**Files:**
- Modify: `e2e-tests/mobile web/auth-flow.spec.ts:102-114`

- [ ] **Step 1: Read the current test block**

Run: `sed -n '102,122p' "e2e-tests/mobile web/auth-flow.spec.ts"`
Confirm it matches the block being replaced in Step 2.

- [ ] **Step 2: Replace the link-selection portion of HAM-A003**

Replace this exact block (lines 102–114):

```typescript
  test('HAM-A003: From login, "Create a new account" navigates to register; back button returns to login', async () => {
    await pm.onMobileHamburger().clickLogInAndExpectLoginPage();

    const createLink = page.getByRole('link', { name: /Create a new account/i });
    await expect(createLink).toBeVisible({ timeout: t(5000) });
    await createLink.tap();
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/register/, { timeout: t(15000) });
    // The register page heading is "Sign Up" per templates/registration/register.html.
    await expect(
      page.getByRole('heading', { name: /^Sign Up$/i }),
    ).toBeVisible({ timeout: t(10000) });
```

with:

```typescript
  test('HAM-A003: From login, "Sign Up" navigates to register; back button returns to login', async () => {
    await pm.onMobileHamburger().clickLogInAndExpectLoginPage();

    // Cross-flow nav under the login title: "Don't have an account? Sign Up".
    // Scope to #login so the header's own Sign Up button can't match.
    const signUpLink = page.locator('#login').getByRole('link', { name: /^Sign Up$/i });
    await expect(signUpLink).toBeVisible({ timeout: t(5000) });
    await signUpLink.tap();
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/register/, { timeout: t(15000) });
    // The register page heading is "Sign Up" per templates/registration/register.html.
    await expect(
      page.getByRole('heading', { name: /^Sign Up$/i }),
    ).toBeVisible({ timeout: t(10000) });
```

(The `page.goBack()` block on lines 116–121 is unchanged.)

- [ ] **Step 3: Commit the test change**

```bash
git add "e2e-tests/mobile web/auth-flow.spec.ts"
git commit -m "test(sc-44545): HAM-A003 expects new Sign Up cross-flow link on login"
```

> Note: we do not run this Playwright test in isolation here — it needs a running site + mobile
> project config. It is verified in Task 5 (or by the QA/CI E2E run). The TDD signal for this work is
> the visual verification in Task 5; this task ensures the suite tracks the new copy.

---

## Task 2: Create the reusable cross-flow nav partial

**Files:**
- Create: `templates/registration/_cross_flow_nav.html`

- [ ] **Step 1: Create the partial file**

Create `templates/registration/_cross_flow_nav.html` with exactly:

```django
{% comment %}
Cross-flow navigation between auth pages (login <-> register).
Params (passed via {% include ... with %}):
  link_href             - base URL for the link (caller passes via {% url ... as %})
  next                  - optional ?next= value to preserve redirect-back (raw, matches existing link)
  prompt_en / prompt_he - plain-text prompt preceding the link
  link_en   / link_he   - the linked call-to-action text
Styling: .registration-prompt in static/css/static.css (Figma 2WflG98PDhWQ7OKrDkaCPb node 35:430).
{% endcomment %}
<p class="registration-prompt control-elem">
    <span class="int-en">{{ prompt_en }} <a href="{{ link_href }}{% if next %}?next={{ next }}{% endif %}">{{ link_en }}</a></span>
    <span class="int-he">{{ prompt_he }} <a href="{{ link_href }}{% if next %}?next={{ next }}{% endif %}">{{ link_he }}</a></span>
</p>
```

- [ ] **Step 2: Verify the file exists and is well-formed**

Run: `cat templates/registration/_cross_flow_nav.html`
Expected: the content above, with balanced `{% %}` tags and both `.int-en` / `.int-he` spans.

- [ ] **Step 3: Commit**

```bash
git add templates/registration/_cross_flow_nav.html
git commit -m "feat(sc-44545): add reusable cross-flow nav partial for auth pages"
```

---

## Task 3: Wire the partial into login.html and remove the old link

**Files:**
- Modify: `templates/registration/login.html:29-32` (insert after `<h1>`)
- Modify: `templates/registration/login.html:62-66` (remove old bottom link)

- [ ] **Step 1: Insert the include directly after the `<h1>` block**

In `templates/registration/login.html`, find this block (the logged-out branch):

```django
            <h1>
                <span class="int-en">Log in to Sefaria</span>
                <span class="int-he">התחברות לספריא</span>
            </h1>
```

Immediately after the closing `</h1>`, add:

```django
            {% url "register" as register_url %}
            {% include "registration/_cross_flow_nav.html" with link_href=register_url next=next prompt_en="Don't have an account?" link_en="Sign Up" prompt_he="אין לכם חשבון?" link_he="להרשמה" %}
```

- [ ] **Step 2: Remove the old bottom "Create a new account" link**

In the same file, delete this exact block (currently after the closing `</form>`):

```django
            <a class="registration-links control-elem" href="{% url "register" %}{% if next %}?next={{ next }}{% endif %}">
                <span class="int-en">Create a new account</span>
                <span class="int-he">חדש? יצירת חשבון משתמש חדש</span>

            </a>
```

Leave the `<form>...</form>` (including the "Forgot your password?" link) and the surrounding
`<div class="inner">` / `<div id="login">` structure intact.

- [ ] **Step 3: Verify the edits**

Run: `grep -n "register_url\|_cross_flow_nav\|Create a new account" templates/registration/login.html`
Expected: lines for `register_url` and `_cross_flow_nav` are present; **no** match for
`Create a new account`.

- [ ] **Step 4: Sanity-check template rendering (no syntax errors)**

Run: `python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','sefaria.settings'); django.setup(); from django.template.loader import get_template; get_template('registration/login.html'); get_template('registration/_cross_flow_nav.html'); print('templates load OK')"`
Expected: `templates load OK` (no `TemplateSyntaxError`).
If the environment can't `django.setup()` (missing local settings/DB env), skip this step and rely on
the visual check in Task 5; note the skip.

- [ ] **Step 5: Commit**

```bash
git add templates/registration/login.html
git commit -m "feat(sc-44545): move registration link under login title via partial"
```

---

## Task 4: Add the scoped CSS (Figma-sourced, general vars)

**Files:**
- Modify: `static/css/static.css` (add after the `.registration-links` rules, ~line 639)

- [ ] **Step 1: Add the `.registration-prompt` rule**

In `static/css/static.css`, immediately after the existing block ending at
`p.registration-links a:hover { ... }` (around line 639), add:

```css
.registrationContent p.registration-prompt {
  margin: 8px 0 0;                  /* directly under the H1, above the form (confirm vs Figma 35:425) */
  text-align: center;
  color: var(--darker-grey);        /* #575757 — Figma Semantic/Action/Secondary */
  font-size: 14px;
  line-height: 18px;
}
.registrationContent p.registration-prompt a {
  color: var(--sefaria-blue);       /* #18345D — Figma Semantic/Text/Link */
  font-weight: 600;                 /* Roboto SemiBold per Figma "Link button" */
  font-size: 14px;                  /* overrides base.css `.registrationContent a { font-size: 16px }` */
  text-decoration: underline;
  margin-inline-start: 4px;         /* 4px gap between prompt and link; RTL-safe */
}
.registrationContent p.registration-prompt a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 2: Verify the vars referenced exist**

Run: `grep -n "\-\-darker-grey\|\-\-sefaria-blue" static/css/color-palette.css`
Expected: `--sefaria-blue: #18345D;` and `--darker-grey: #575757;` both present.

- [ ] **Step 3: Verify the rule was added and has no obvious syntax error**

Run: `grep -n "registration-prompt" static/css/static.css`
Expected: three selectors (`p.registration-prompt`, `p.registration-prompt a`, `p.registration-prompt a:hover`).

- [ ] **Step 4: Commit**

```bash
git add static/css/static.css
git commit -m "style(sc-44545): scoped .registration-prompt link styling from Figma tokens"
```

---

## Task 5: Verify end-to-end (visual + behavior)

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server** (if not already running)

Run: `python manage.py runserver` (or the project's standard local run)
Expected: server boots; `/login` reachable.

- [ ] **Step 2: Visual check — English**

Open `http://localhost:8000/login` logged out, interface English. Confirm against Figma `35:425`:
- "Don't have an account? Sign Up" sits **directly under** the "Log in to Sefaria" title, **above** the email/password fields.
- Prompt text is grey (`--darker-grey`); "Sign Up" is **sefaria-blue, SemiBold, underlined**, ~4px after the prompt.
- The old bottom "Create a new account" link is **gone**; "Forgot your password?" still sits under the Login button.

- [ ] **Step 3: Visual check — Hebrew (RTL)**

Switch interface to Hebrew (`/login` with Hebrew interface). Confirm:
- Line reads "אין לכם חשבון? להרשמה", laid out RTL, link styled the same, gap on the correct (leading) side.

- [ ] **Step 4: Behavior — `next` preserved**

Visit `http://localhost:8000/login?next=/texts` logged out. Hover/inspect the "Sign Up" link.
Expected: `href` is `/register?next=/texts`. Click it → lands on `/register?next=/texts`.

- [ ] **Step 5: Mobile width check**

Narrow the viewport to a phone width (Figma note `35:905`). Confirm the line still sits under the
title, above the form, and wraps acceptably.

- [ ] **Step 6: Regression — register page unchanged**

Open `/register`. Confirm its existing links (e.g. "Already have an account? Log in") look exactly as
before (the new class is scoped to `.registration-prompt`, so they must be untouched).

- [ ] **Step 7: (If E2E env available) run the updated mobile auth test**

Run: `npx playwright test "e2e-tests/mobile web/auth-flow.spec.ts" -g "HAM-A003"`
Expected: PASS. If the local E2E harness/base URL isn't configured, note that this is deferred to CI/QA.

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Placement under H1 → Task 3 Step 1. ✓
- Underlined sefaria-blue SemiBold link + 4px gap, general vars, no hex → Task 4. ✓
- Copy EN/HE from story → Task 2 + Task 3 Step 1. ✓
- Reusable partial seam (SC-44544 awareness) → Task 2. ✓
- `next` preserved → partial (Task 2) + verified Task 5 Step 4. ✓
- Remove old bottom link → Task 3 Step 2. ✓
- Django 6 `{% url as %}` approach → Task 3 Step 1. ✓
- Mobile + Hebrew/RTL → Task 5 Steps 3, 5. ✓
- Register-page regression → Task 5 Step 6. ✓
- E2E selector dependency (HAM-A003) → Task 1. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete and literal. ✓

**Consistency:** Class name `.registration-prompt`, partial path `registration/_cross_flow_nav.html`,
var names `--darker-grey` / `--sefaria-blue`, and the `register_url` variable are used identically
across Tasks 2–4 and the test selector in Task 1. ✓
