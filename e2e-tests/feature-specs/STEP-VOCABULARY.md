# Shared step vocabulary

Sentences that already work in any `.feature` file, with no new code. They are defined in
`steps/common.steps.ts`; keep this list in sync with it. Product: prefer these where they say what
you mean. Anything else is fine too: an engineer will write the step.

`{text}` means a value in double quotes, e.g. `"Genesis 1"`.

| Sentence                                                  | Meaning                                          |
| --------------------------------------------------------- | ------------------------------------------------ |
| `Given I am a logged-out visitor`                         | Anonymous visitor (the default)                  |
| `Given I am logged in`                                    | Logged in as the standard test user              |
| `Given I am logged in as staff`                           | Logged in as the staff (admin) test user         |
| `Given the interface language is English` / `Hebrew`      | Interface language                               |
| `When I open the Library page {path}`                     | Go to a path on the Library, e.g. `"/Genesis.1"` |
| `When I open the Voices page {path}`                      | Go to a path on Voices, e.g. `"/topics"`         |
| `When I open the Developers page {path}`                  | Go to a path on the developer portal             |
| `When I click the {name} link`                            | Click a link by its visible name                 |
| `When I click the {name} button`                          | Click a button by its visible name               |
| `Then I see {text}`                                       | Some text is visible on the page                 |
| `Then I do not see {text}`                                | That text is not on the page                     |
| `Then I see a {name} link` / `Then I see a {name} button` | A link or button with that name is visible       |
| `Then the address contains {text}`                        | The URL contains this text                       |
| `Then the page title contains {text}`                     | The browser tab title contains this text         |

## The developer portal

`Developers` is the third site, at `developers.<domain>`, e.g.
`When I open the Developers page "/reference/get-v3-texts"`. It is English only, so
`Given the interface language is Hebrew` does not change it.

`Given I am logged in as staff` is for stories about the portal's editor, which only staff can
reach. Stories about editing never really save: the steps intercept saves and publishes, because
every pull request's sandbox shares one database.
