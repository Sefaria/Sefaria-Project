# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Ask button". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: The floating Ask button

  @scope-general @fail
  Scenario Outline: LA-BTN-1 Everyone with the assistant sees the Ask button
    Given the visitor is <who> on <site>
    And the assistant is closed
    When a library page loads
    Then a button labelled "Ask" [assistant.floating_button.label] with a star shows in the bottom corner

    @e2e @desktop @phone
    Examples:
      | who                              | site       |
      | logged out                       | sefaria.org |
      | logged in with the assistant on  | sefaria.org |
      | logged out                       | sefaria.org.il |
      | logged in with the assistant on  | sefaria.org.il |

  @scope-general @e2e @desktop @fail
  Scenario: LA-BTN-2 Assistant turned off in settings
    Given the visitor is logged in and turned the assistant off in their settings
    When a library page loads
    Then no Ask button is shown

  @scope-general @e2e @desktop @fail
  Scenario: LA-BTN-3 Not on the login and sign-up pages
    When the visitor opens the login page or the sign-up page
    Then no Ask button is shown

  @scope-general @e2e @desktop @fail
  Scenario: LA-BTN-4 Look of the button
    Given the Ask button is shown
    Then it is 56px tall and fully rounded
    And its background is #7C416F (Sefaria's mussar purple) with white text
    And its label is 16px, weight 500, beside an 18px four-point star

  @scope-general @e2e @desktop @fail
  Scenario: LA-BTN-5 Hover and press darken the button
    Given a device with a mouse
    When the pointer hovers over the Ask button
    Then its background is #653259
    When the visitor presses it
    Then its background is #653259

  @scope-mobile @e2e @phone
  Scenario: LA-BTN-6 No hover color on touch screens
    Given a touch device
    When the visitor taps the Ask button
    Then the assistant opens on the first tap
    And the button never shows the hover color

  @scope-general @e2e @desktop
  Scenario: LA-BTN-7 Keyboard focus is visible
    When the visitor moves keyboard focus to the Ask button
    Then a focus ring is visible around it
    And pressing Enter opens the assistant

  @scope-general
  Scenario Outline: LA-BTN-8 Position
    Given the interface is <lang>
    Then the Ask button sits <gap> from the bottom and <gap> from the <side> edge

    @e2e
    Examples:
      | lang    | gap  | side  |
      | English | 24px | right |
      | Hebrew  | 24px | left  |

  @scope-mobile @e2e @phone
  Scenario: LA-BTN-9 Phones: 16px from the corner
    Then the Ask button sits 16px from the bottom (above the home bar) and 16px from the side

  @scope-mobile @e2e @phone
  Scenario: LA-BTN-10 The button stays put while the visitor scrolls
    Given the visitor is reading a text on a phone
    When the visitor scrolls the page down and up
    Then the Ask button stays visible in the same place the whole time
