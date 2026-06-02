# Login Page Cross-Flow Navigation — Design Spec

**Story:** [SC-44545 — Update login page to handle anon LA candidates who don't have an account](https://app.shortcut.com/sefaria/story/44545)
**Epic:** Library Assistant System and UX (41184)
**Date:** 2026-06-02
**Author:** Yotam Fromm (with Claude Code)

---

## 1. Problem & Goal

As part of simplifying the Library Assistant (LA) promo, logged-out users will be funneled
through a single "Log in to Try" entry point (the separate Register button is going away).
That makes the **login page** the primary place where a user without an account must discover
how to create one.

Today the "create an account" link sits at the **bottom** of the login form, below "Forgot your
password?", styled in medium-grey with **no underline** — easy to overlook.

**Goal:** Make the path to registration hard to miss, with as light a touch as possible, in both
English and Hebrew.

### Acceptance Criteria (from the story)

- Change **placement** of the navigation to the registration page.
- Change **styling** of the link (standard link convention: underlined, blue — per Figma annotation).
- Slight **copy** changes:
  - English: `Don't have an account? Sign Up`
  - Hebrew: `אין לכם חשבון? להרשמה`
- Requires EN and HE.

> **The story is the source of truth for the strings, not Figma.**

### Out of scope

- The register-page mirror ("Already have an account? Log in") — that's a separate concern
  (and conceptually part of SC-44544 follow-up). This spec touches **login only**.
- Removing the nav-bar Register button / "Log in to Try" promo button — that's the LA-promo work.
- Auto-enrolling users into the experiment on auth (**SC-44544**) — backend work in the auth
  views; explicitly deferred. See §6 for how this design leaves a clean seam for it.

---

## 2. Current State

`templates/registration/login.html` is **server-rendered** by `CustomLoginView(StaticViewMixin, LoginView)`
(`sefaria/views.py:93`) — Django handles CSRF, the credential POST, form-error rendering, and the
`next` redirect server-side. It is **not** a React/SPA page. (The React `LoginPrompt` / `SignUpModal`
in `static/js/Misc.jsx` are a different surface — in-app modals for anonymous users.)

Relevant current markup (`login.html`, logged-out branch):

```django
<h1>
    <span class="int-en">Log in to Sefaria</span>
    <span class="int-he">התחברות לספריא</span>
</h1>
... form (email, password, Login button, "Forgot your password?") ...
<a class="registration-links control-elem" href="{% url "register" %}{% if next %}?next={{ next }}{% endif %}">
    <span class="int-en">Create a new account</span>
    <span class="int-he">חדש? יצירת חשבון משתמש חדש</span>
</a>
```

Current link styling (`static/css/static.css:620`): `.registrationContent a.registration-links`
— centered, `--medium-grey`, 14px, `text-decoration: none`.

---

## 3. Chosen Approach — Reusable Django Include Partial (Option B)

Rather than a one-off inline edit, extract the cross-flow navigation line into a small reusable
Django template partial included via `{% include %}`. This:

- Is the idiomatic DRY tool for a **server-rendered** page (no React introduced into the auth flow,
  so CSRF / session / POST / `next` redirect stay server-side and free).
- Gives a single component reused by login now and (later) the register-page mirror.
- Creates a clean seam (one partial) where SC-44544's enrollment-aware behavior or copy can hook in.

> A full React migration of the auth pages was considered and rejected for this story: it
> concentrates risk on a conversion/security-critical surface (re-implementing CSRF, credential
> POST, session, error states, `next` redirect, analytics parity, RTL) for no benefit to either
> SC-44545 (copy/placement) or SC-44544 (backend enrollment). If desired, it should be its own
> deliberately-scoped story/spike.

---

## 4. Design Detail

### 4.1 New partial — `templates/registration/_cross_flow_nav.html`

A presentational partial that renders a "prompt text + inline link" line in both languages.
It is parameterized via `{% include ... with %}` so it carries no page-specific assumptions.

```django
{% comment %}
Cross-flow navigation between auth pages (login <-> register).
Params:
  link_href  - URL for the link (caller builds it, including any ?next=)
  prompt_en / prompt_he - plain-text prompt preceding the link
  link_en    / link_he  - the linked call-to-action text
{% endcomment %}
<p class="registration-prompt control-elem">
    <span class="int-en">{{ prompt_en }} <a href="{{ link_href }}">{{ link_en }}</a></span>
    <span class="int-he">{{ prompt_he }} <a href="{{ link_href }}">{{ link_he }}</a></span>
</p>
```

Notes:
- The `<a>` text is the only part that is a link (matches the Figma "Small text + Link button"
  split and the "blue + underlined, inline" decision).
- Strings are passed in by the caller (hard-coded EN/HE spans in the caller-supplied params),
  keeping the partial reusable and the strings co-located with the page that owns them. The login
  caller uses the exact story strings.

### 4.2 `templates/registration/login.html`

1. **Add**, directly after the `<h1>Log in to Sefaria</h1>` block and before the error/form block:

   ```django
   {% include "registration/_cross_flow_nav.html" with link_href="register"|... %}
   ```

   The `link_href` must preserve the existing `next` behavior. Because `{% url %}` cannot be
   composed inside `with` cleanly alongside the conditional `?next=`, the caller builds the href
   inline. Concretely, the include is wrapped so the href equals:
   `{% url "register" %}{% if next %}?next={{ next }}{% endif %}` — identical to today's link.

   Strings passed:
   - `prompt_en = "Don't have an account?"`, `link_en = "Sign Up"`
   - `prompt_he = "אין לכם חשבון?"`, `link_he = "להרשמה"`

   > Implementation note for the plan: if passing a pre-built URL string through `with` proves
   > awkward in the Django template language, the acceptable fallback is to inline the partial's
   > markup in the two callers but keep `.registration-prompt` styling shared — reuse of the
   > **style** is the non-negotiable part; the partial is the preferred-but-not-load-bearing part.

2. **Remove** the old bottom registration link (the `<a class="registration-links control-elem"
   href="...register...">Create a new account</a>` block). "Forgot your password?" remains under
   the Login button.

### 4.3 `static/css/static.css`

Add a new, scoped rule (placed near the existing `.registration-links` rules, ~line 620) so the
existing `register.html` links are **not** affected:

```css
.registrationContent p.registration-prompt {
  margin: 8px 0 0;            /* sits snug under the H1, above the form */
  text-align: center;
  color: var(--medium-grey);
  font-size: 14px;
}
.registrationContent p.registration-prompt a {
  color: var(--inline-link-blue);   /* #4871bf — standard inline link blue */
  text-decoration: underline;
}
.registrationContent p.registration-prompt a:hover {
  text-decoration: underline;
}
```

(Exact margins to be confirmed visually against the Figma frame `35:425`; the values above are a
starting point matching the design's "directly under the title" placement.)

---

## 5. Data Flow / Behavior

No change to authentication behavior. The link is a plain server-rendered anchor to `/register`
(carrying `?next=` when present). Submitting credentials still POSTs to Django's `LoginView` exactly
as today. EN/HE visibility is handled by the existing `.int-en` / `.int-he` interface-language
mechanism.

---

## 6. Forward-Compatibility with SC-44544

SC-44544 ("LA Promo — change opt-in behavior for non-authenticated users") requires that, on
**completion of login/register**, the user is auto-added to the experiments whitelist
(`_set_user_experiments` / `UserExperimentSettings`), then a page reload returns them to their prior
location with LA shown (the existing `_is_user_in_experiment` gate in
`sefaria/system/context_processors.py:141`). That work lives in the **auth views** (Python), not in
this template. This design does not block it and does not duplicate logic it will touch; the new
partial is simply the place any future copy tweak ("Sign up to try the Library Assistant") would go.

---

## 7. Testing

- **Manual / visual:** Load `/login` logged-out in EN and HE; confirm the prompt sits under the
  title, the link is blue + underlined, copy matches the story strings exactly, and RTL renders
  correctly in Hebrew. Confirm `?next=` is preserved through the link.
- **Regression:** Confirm `register.html` links are visually unchanged (new class is scoped).
- **E2E:** The repo has `e2e-tests/pages/loginPage.ts` and
  `e2e-tests/Sanity/cross-module-login.spec.ts`. Check whether either asserts on the old
  "Create a new account" link text/placement; update selectors/assertions if so.

---

## 8. Files Touched

| File | Change |
|------|--------|
| `templates/registration/_cross_flow_nav.html` | **New** — reusable cross-flow nav partial |
| `templates/registration/login.html` | Add include under `<h1>`; remove old bottom link |
| `static/css/static.css` | Add scoped `.registration-prompt` rule (blue underlined link) |
| `e2e-tests/...` (conditional) | Update selectors if they target the old link |

---

## 9. Open Questions / Risks

- **Django `{% include ... with %}` + composed `{% url %}?next=` ergonomics.** If passing a
  pre-built href through `with` is awkward, fall back to inline markup in the caller while keeping
  the shared `.registration-prompt` CSS (see §4.2 note). Low risk either way.
- **Exact spacing** under the H1 — confirm against Figma `35:425` during implementation.
