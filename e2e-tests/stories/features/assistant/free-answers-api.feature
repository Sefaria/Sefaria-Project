# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Free-answer rules on the server". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Free answers on the server

  @scope-anon @api
  Scenario: LA-API-1 A logged-out visitor can chat without an account
    When a chat request arrives from a logged-out visitor
    Then the server answers normally

  @scope-anon @api
  Scenario: LA-API-2 Free answers are counted per visitor
    Given the free-answer limit is 2
    When one logged-out visitor gets 2 answers
    Then that visitor's next question is refused as needing login
    And another logged-out visitor is not affected

  @scope-anon @api
  Scenario: LA-API-3 Failed answers don't count
    Given a logged-out visitor with 1 free answer left
    When their answer fails
    Then they still have 1 free answer left

  @scope-anon @api
  Scenario: LA-API-4 Signed-in users have no limit
    When a signed-in user asks more than 2 questions
    Then every question is answered

  @scope-anon @api
  Scenario: LA-API-5 The search question exception
    Given a logged-out visitor with 1 free answer left
    When a question marked as coming from the empty-search button arrives
    Then it is answered and the visitor still has 1 free answer left
    When a second such question arrives later
    Then it counts as usual

  @scope-anon @api
  Scenario: LA-API-6 Nothing past the limit
    Given a logged-out visitor with no free answers left
    When any question arrives, including one from the empty-search button
    Then it is refused as needing login
