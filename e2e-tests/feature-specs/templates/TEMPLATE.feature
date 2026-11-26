# Template for a behavior spec. Copy to e2e-tests/feature-specs/features/<area>/<slug>.feature
# (area: library, voices, assistant, account, ...; slug: the Shortcut story slug).
# One file per Shortcut story. Guidance: e2e-tests/feature-specs/README.md and
# STEP-VOCABULARY.md (sentences that already work).
#
# Rules of thumb:
# - Describe what a person sees and does, not how the page is built (no CSS, no element ids).
# - One behavior per scenario. Name the scenario after the behavior.
# - Given = the situation, When = one action, Then = observable outcomes.
# - Put real example values in quotes: "Genesis 1", "Shabbat".
# - Tag every scenario with its story: @sc-12345. Add @mobile for phone-only behavior.

@sc-12345
Feature: <Short name of the capability>
  <One or two sentences: who this is for and why it matters.>

  Background:
    Given I am a logged-out visitor

  Scenario: <The behavior, in a phrase>
    When I open the Library page "/<path>"
    Then I see "<something the person should see>"

  Scenario Outline: <A behavior that holds for several inputs>
    When I open the Library page "<path>"
    Then the page title contains "<title>"

    Examples:
      | path        | title     |
      | /Genesis.1  | Genesis 1 |
      | /Exodus.1   | Exodus 1  |
