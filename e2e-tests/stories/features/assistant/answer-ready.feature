# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Answer-ready notification". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Answer-ready notification

  @scope-general @e2e @desktop @phone @fail
  Scenario: LA-NOTE-1 An answer that lands while the assistant is closed
    Given the visitor asked a question
    And closed the assistant before the answer arrived
    When the answer arrives
    Then a red dot appears on the Ask button
    And the button bounces twice, then stays still with the dot
    And screen readers hear "Your Library Assistant answer is ready" [assistant.header.response_ready_announcement]
    And the button's accessible name is "Open Library Assistant: your answer is ready" [assistant.header.open_ready_response]

  @scope-general @e2e @desktop @fail
  Scenario: LA-NOTE-2 Look and timing
    Given the answer-ready dot is shown
    Then the dot is a 12px circle, #C03522, with a 2px white ring, at the button's top corner on the start side
    And each bounce lasts 0.6s, rising 6px, then a 2px hop
    And with each bounce the dot sends out a fading ping

  @scope-general @e2e @desktop @phone @fail
  Scenario: LA-NOTE-3 Opening clears it
    Given the Ask button shows the answer-ready dot
    When the visitor opens the assistant
    Then the answer is shown and the dot is gone
    When the visitor closes the assistant again
    Then the button shows no dot

  @scope-general @e2e @desktop @fail
  Scenario: LA-NOTE-4 The relabelled button gets the dot too
    Given the button reads "Search with Library Assistant"
    And an answer arrives while the assistant is closed
    Then the dot appears and the label stays "Search with Library Assistant"

  @scope-general @e2e @desktop @fail
  Scenario: LA-NOTE-5 Reduced motion
    Given the visitor prefers reduced motion
    When an answer arrives while the assistant is closed
    Then the dot appears without bouncing or pinging
