# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Switching chats". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Switching chats

  Background:
    Given the visitor is signed in and has 3 saved chats

  @scope-general @e2e @desktop @phone @fail
  Scenario: LA-CHAT-1 A chat that has to load
    Given chat A is open
    And chat B has not been opened during this visit
    When the visitor picks chat B from chat history
    Then chat A's messages disappear at once
    And a 24px spinning loader-circle icon, #6F6F6F, one turn per 0.8s, is centered in the chat area
    And screen readers hear "Loading messages..." [assistant.messages.loadingHistory]
    When chat B arrives
    Then chat B shows, scrolled to its last message

  @scope-general @e2e @desktop
  Scenario: LA-CHAT-2 A chat already opened during this visit
    Given chat B was opened earlier during this visit
    When the visitor picks chat B
    Then chat B shows at once, with no loader
