# Developer portal contracts

The interfaces settled before the builders fan out (PLAN.md §4.3). A contract changes only through the Integrator, who announces the change in every affected inbox under `.devportal-run/inbox/`. Builders read contracts; they do not edit them.

| ID  | Contract                           | Where it lives                                                                                                                                                                                           |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Names, paths, settings             | [`C1_names.md`](C1_names.md); every `DEVPORTAL_*` setting with its default in [`settings.json`](settings.json)                                                                                           |
| C2  | Django models                      | The model code in `devportal/models/` and the first migration `devportal/migrations/0001_initial.py`. Never edit a pushed migration; add a new one (PLAN.md §2.3.4)                                      |
| C3  | JSON shapes                        | JSON Schemas in [`schemas/`](schemas/), fixtures in [`fixtures/`](fixtures/), TypeScript mirrors in `devportal-ui/src/contracts/`                                                                        |
| C4  | Markdown dialect and DOM           | [`DIALECT.md`](DIALECT.md), one fixture per construct in `fixtures/`, expected HTML in [`golden/`](golden/); normalization in `NORMALIZE.md`; regenerate with `python -m devportal.contracts.regenerate` |
| C5  | Design tokens and CSS conventions  | Written by the UI workstream: `devportal-ui/src/styles/` (`tokens.css`, `readme-tokens.css`, `article.css`), the `dp-` prefix rule, CSS Modules, the breakpoints                                         |
| C6  | Component names and accessibility  | Written by the UI workstream: the component inventory with landmarks, roles and accessible names                                                                                                         |
| C7  | Page-object API and BDD vocabulary | Written by the harness workstream: `e2e-tests/pages/developers/` signatures and the new shared sentences                                                                                                 |
| C8  | Analytics events                   | Written by the UI workstream: event names and parameters (PLAN.md §2.13)                                                                                                                                 |
| C9  | URL map and redirects              | [`C9_urls.json`](C9_urls.json)                                                                                                                                                                           |
| C10 | Security invariants                | [`C10_security.md`](C10_security.md) (prose) and [`security.json`](security.json) (values tests assert)                                                                                                  |

`devportal/tests/pure/contracts_c1_c9_c10_test.py` checks that C1, C9 and C10 are well formed and agree with `sefaria/settings.py` and the standalone settings.
