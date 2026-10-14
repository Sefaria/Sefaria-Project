# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Cookie banner on phones". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: The cookie banner and the assistant

  Background:
    Given the window is 393px wide
    And the visitor has not accepted cookies, so the cookie banner is shown

  @scope-mobile @e2e @phone
  Scenario: LA-COOKIE-1 The Ask button floats above the banner
    Then the Ask button's bottom edge is 16px above the banner's top edge
    And if the banner's text wraps to more lines, the button stays 16px above it

  @scope-mobile @e2e @phone
  Scenario: LA-COOKIE-2 Accepting cookies lets the button slide back down
    When the visitor taps "OK" on the banner
    Then the Ask button slides back to 16px above the bottom of the screen over 0.2s
    And it slides, never jumps, with reduced motion too

  @scope-mobile @e2e @phone
  Scenario: LA-COOKIE-3 The open assistant covers the banner
    When the visitor opens the assistant
    Then the assistant is on top of the banner
    And the text box and send button are visible and usable
    When the visitor closes the assistant
    Then the banner is shown again, with the Ask button above it

  @scope-general @e2e @desktop
  Scenario: LA-COOKIE-4 Wider windows don't move the button
    Given the window is 1280px wide
    Then the cookie banner is a card in the corner
    And the Ask button stays 24px above the bottom of the screen
