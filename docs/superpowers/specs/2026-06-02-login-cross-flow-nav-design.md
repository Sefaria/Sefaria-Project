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
- Change **styling** of the link (standard link convention: underlined, sefaria-blue — per Figma annotation).
- Slight **copy** changes:
  - English: `Don't have an account? Sign Up`
  - Hebrew: `אין לכם חשבון? להרשמה`
- Requires EN and HE.

> **Source-of-truth split:** the **story** is authoritative for the *strings*; **Figma**
> (file `2WflG98PDhWQ7OKrDkaCPb`, node `35:425`) is authoritative for *layout, styling, and CSS
> tokens*, including its dev-mode annotations. The story strings and the Figma text agree, so
> there is no conflict.

### Figma annotations (dev-mode notes) — incorporated as source of truth

- **Note `35:653` — "Change: Placement & Styling of the cross-flow navigation to the registration page":**
  Placement to increase visibility · standard link conventions (underlined) to improve
  discoverability · minor copy changes.
- **Note `35:905` — "Mobile implementation":** same component, mobile frame (`35:742`). The line sits
  under the title, above the form, at mobile widths too.
- **Note `35:914` — "Hebrew version":** RTL variant (frame `35:931`) — same prompt-then-link order,
  laid out RTL.

### Exact visual spec from Figma (`35:430`, the prompt + link)

| Element | Figma token / value | General var |
|---------|---------------------|-------------|
| Prompt "Don't have an account?" | Roboto Regular, 14px / 18px, color `#575757` (`Semantic/Action/Secondary`), centered | `var(--darker-grey)` |
| Link "Sign Up" | Roboto **SemiBold (600)**, 14px / 18px, color `#18345d` (`Semantic/Text/Link` = brand sefaria-blue), **underlined** | `var(--sefaria-blue)` |
| Gap between prompt and link | `4px` | — |

> The link is **sefaria-blue `#18345D`** per Figma's `Semantic/Text/Link` token — *not* the
> `--inline-link-blue` (#4871bf) assumed in an earlier draft. Both general-vars already exist in
> `static/css/color-palette.css` (`--darker-grey: #575757`, `--sefaria-blue: #18345D`).

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
  link_href             - base URL for the link (caller passes via {% url ... as %})
  next                  - optional ?next= value to preserve redirect-back (raw, matches existing)
  prompt_en / prompt_he - plain-text prompt preceding the link
  link_en    / link_he  - the linked call-to-action text
{% endcomment %}
<p class="registration-prompt control-elem">
    <span class="int-en">{{ prompt_en }} <a href="{{ link_href }}{% if next %}?next={{ next }}{% endif %}">{{ link_en }}</a></span>
    <span class="int-he">{{ prompt_he }} <a href="{{ link_href }}{% if next %}?next={{ next }}{% endif %}">{{ link_he }}</a></span>
</p>
```

Notes:
- The `<a>` text is the only part that is a link (matches the Figma `35:430` "Small text" +
  "Link button" split and the "underlined sefaria-blue, inline" decision).
- Strings are passed in by the caller, keeping the partial reusable and the strings co-located with
  the page that owns them. The login caller uses the exact story strings.
- `?next=` uses raw `{{ next }}` to match the existing link and the form's hidden `next` input
  exactly (no behavior drift). `|urlencode` is a possible hardening follow-up, applied consistently
  across both, but is out of scope here.

### 4.2 `templates/registration/login.html`

1. **Add**, directly after the `<h1>Log in to Sefaria</h1>` block and before the error/form block,
   using Django's standard `{% url ... as %}` assignment (valid and idiomatic in **Django 6.0**):

   ```django
   {% url "register" as register_url %}
   {% include "registration/_cross_flow_nav.html" with link_href=register_url next=next prompt_en="Don't have an account?" link_en="Sign Up" prompt_he="אין לכם חשבון?" link_he="להרשמה" %}
   ```

   `{% url "register" as register_url %}` resolves the base URL into a variable cleanly (no awkward
   string-building); the partial appends `?next=` only when `next` is set, preserving today's
   redirect-back behavior exactly. The included template still inherits the parent context, but the
   params are passed explicitly for clarity. (Django 6's `{% querystring %}` tag was considered but
   isn't needed — it operates on the *current request's* query string, whereas here we set `next`
   on the register link.)

2. **Remove** the old bottom registration link (the `<a class="registration-links control-elem"
   href="...register...">Create a new account</a>` block). "Forgot your password?" remains under
   the Login button.

### 4.3 `static/css/static.css` (global CSS, general vars)

The login page is styled by `static/css/static.css` — a hand-written **global** stylesheet that
already uses native CSS custom properties (e.g. `var(--medium-grey)`). It is **not** processed by
the project's PostCSS step (PostCSS is configured only for the React bundle's CSS-modules, via
css-loader). So the styling uses CSS custom properties resolved at runtime, sourced from the
**general vars** in `static/css/color-palette.css`. **No hardcoded hex** — reference the tokens that
match Figma's values.

Add a new, scoped rule (placed near the existing `.registration-links` rules, ~line 620) so the
existing `register.html` links are **not** affected. Values come from the Figma `35:430` spec:

```css
.registrationContent p.registration-prompt {
  margin: 8px 0 0;                  /* directly under the H1, above the form */
  text-align: center;
  color: var(--darker-grey);        /* #575757 — Figma Semantic/Action/Secondary */
  font-size: 14px;
  line-height: 18px;
}
.registrationContent p.registration-prompt a {
  color: var(--sefaria-blue);       /* #18345D — Figma Semantic/Text/Link */
  font-weight: 600;                 /* Roboto SemiBold per Figma "Link button" */
  font-size: 14px;                  /* overrides base.css `.registrationContent a { font-size:16px }` */
  text-decoration: underline;
  margin-inline-start: 4px;         /* 4px gap between prompt and link (RTL-safe) */
}
.registrationContent p.registration-prompt a:hover {
  text-decoration: underline;
}
```

Notes:
- `font-weight: 600` + the explicit `font-size: 14px` are required because `base.css:564`
  (`.registrationContent a { font-size: 16px; }`) would otherwise apply; the
  `p.registration-prompt a` selector is more specific and wins.
- `margin-inline-start` (logical property) keeps the 4px gap correct in both LTR and RTL, so the
  Hebrew variant (Figma note `35:914`) needs no separate rule.
- Exact top margin to be confirmed visually against Figma frame `35:425` during implementation;
  `8px` is the starting value for "directly under the title".

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

- **Manual / visual (against Figma `35:425`):** Load `/login` logged-out in EN and HE; confirm the
  prompt sits directly under the title above the form; prompt text is `--darker-grey` 14px; the
  "Sign Up" / "להרשמה" link is `--sefaria-blue`, SemiBold, underlined, with a 4px gap; copy matches
  the story strings exactly; RTL renders correctly in Hebrew (prompt-then-link, gap on the correct
  side). Check **mobile** width too (Figma note `35:905`).
- **Behavior:** Confirm `?next=` is preserved through the link and the credential POST to Django's
  `LoginView` is unchanged.
- **Regression:** Confirm `register.html` links are visually unchanged (the new class is scoped to
  `.registration-prompt`).
- **E2E:** The repo has `e2e-tests/pages/loginPage.ts` and
  `e2e-tests/Sanity/cross-module-login.spec.ts`. Check whether either asserts on the old
  "Create a new account" link text/placement; update selectors/assertions if so.

---

## 8. Files Touched

| File | Change |
|------|--------|
| `templates/registration/_cross_flow_nav.html` | **New** — reusable cross-flow nav partial |
| `templates/registration/login.html` | Add include under `<h1>`; remove old bottom link |
| `static/css/static.css` | Add scoped `.registration-prompt` rule (SemiBold, underlined, `--sefaria-blue` link) |
| `e2e-tests/...` (conditional) | Update selectors if they target the old link |

---

## 9. Open Questions / Risks

- **Django 6 template approach (resolved):** use `{% url "register" as register_url %}` +
  `{% include ... with link_href=register_url next=next ... %}`. Standard, idiomatic, and valid in
  Django 6.0.4 (the project's version, per `requirements.txt:80`). No awkward string-building; the
  fallback of inlining the markup is no longer needed.
- **Exact spacing** under the H1 — confirm `8px` against Figma `35:425` during implementation.
- **CSS pipeline assumption:** styling is added to the global `static/css/static.css` using native
  CSS custom properties from `color-palette.css`. There is no global PostCSS transform (PostCSS is
  CSS-modules-only, for the React bundle). If a different convention is expected, flag before build.
