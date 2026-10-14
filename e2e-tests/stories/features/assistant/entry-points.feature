# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Fixed entry points". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Fixed entry points

  @scope-general @fail
  Scenario Outline: LA-ENTRY-2 Header pill on the large and medium headers
    Given the window is <width> wide
    And the visitor is on a library page with the assistant on
    Then the header shows a "✦ Library Assistant" pill [header.library_assistant] just before the search box
    When the visitor clicks it
    Then the assistant opens

    @e2e
    Examples:
      | width  |
      | 1280px |
      | 900px  |

  @scope-general @e2e @desktop @fail
  Scenario: LA-ENTRY-3 Header pill opens with the keyboard
    When the visitor tabs to the header pill
    Then a focus ring is visible
    And pressing Enter or Space opens the assistant

  @scope-general @e2e @desktop @fail
  Scenario: LA-ENTRY-4 Header pill only in the library
    When the visitor is on a Voices page
    Then the header has no Library Assistant pill

  @scope-general @e2e @desktop @fail
  Scenario: LA-ENTRY-5 Look of the header pill
    Then the pill is 30px tall, fully rounded, #7C416F with white 14px text and a 16px star
    And hovering or pressing it turns it #653259

  @scope-mobile @e2e @phone
  Scenario: LA-ENTRY-6 Mobile menu item
    Given the window is 842px wide or less
    When the visitor opens the hamburger menu
    Then it shows "✦ Library Assistant" [header.library_assistant] directly above Learning Schedules
    And the floating Ask button is hidden while the menu is open
    When the visitor taps the item
    Then the menu closes and the assistant opens

  @scope-general @e2e @desktop @phone @fail
  Scenario: LA-ENTRY-8 No entry points with the assistant off
    Given the visitor is logged in with the assistant turned off
    Then there is no header pill, no mobile menu item and no Ask button
