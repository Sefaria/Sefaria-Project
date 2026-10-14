# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Accessibility and Hebrew". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Accessibility and Hebrew

  @scope-general @e2e @desktop @fail
  Scenario: LA-A11Y-1 Reduced motion
    Given the visitor prefers reduced motion
    Then the Ask button doesn't bounce and its width doesn't animate when relabelled
    And the login prompt appears without moving
    But the button's move above the cookie banner still slides (a decision: a jump reads as a glitch)

  @scope-anon @e2e @desktop
  Scenario: LA-A11Y-2 Locked controls stay reachable
    Given the visitor is logged out
    When the visitor tabs through the assistant's header and menu
    Then the locked history button and the locked "New chat" item can be focused
    And each is announced as unavailable

  @scope-anon @e2e @desktop
  Scenario: LA-A11Y-3 The login prompt is announced
    Given a screen reader is running
    When the login prompt replaces the text box
    Then the screen reader announces its text

  @scope-general @e2e @desktop @he @fail
  Scenario: LA-RTL-1 Hebrew layout
    Given the interface is Hebrew
    Then the Ask button shows the Hebrew value of [assistant.floating_button.label] and sits in the bottom-left corner, star on the right
    And the answer-ready dot sits at the button's top-right corner
    And the login prompt shows the Hebrew values of [assistant.anon.limit_reached] and [assistant.anon.login_button]
    And announcements are in Hebrew

  @scope-mobile @e2e @phone @he
  Scenario: LA-RTL-2 Phone sheet in Hebrew
    Given the interface is Hebrew and the window is 393px wide
    When the visitor opens the assistant
    Then the drag handle is still centered at the top
