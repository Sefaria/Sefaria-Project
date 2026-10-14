# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Open decisions". These wait on a Product decision (@decision-needed: keep the
# chosen option, delete the rest) or on work not yet planned (@spec-gap), and never run until then.
# See e2e-tests/stories/README.md before editing.
Feature: Open decisions

  # Logged-out chat after time away: spec 3.4 asks to stop clearing the assistant after
  # 30 minutes; today that's decided only for visitors at the limit.

  @scope-anon @decision-needed @e2e @desktop
  Scenario: LA-OPEN-Q1a Option A: a logged-out visitor's chat survives 30 minutes away
    Given a logged-out visitor with free answers left asked a question
    When the visitor comes back after more than 30 minutes
    Then the assistant shows their earlier conversation

  @scope-anon @decision-needed @e2e @desktop
  Scenario: LA-OPEN-Q1b Option B: after 30 minutes away the chat starts fresh (the PRs today)
    Given a logged-out visitor with free answers left asked a question
    When the visitor comes back after more than 30 minutes
    Then the assistant shows an empty chat
    And their free-answer count is unchanged

  # Logging in from the login prompt: where the visitor lands, how long the return is
  # remembered, and whether their logged-out questions join their history (spec 3.3, 10.2).

  @scope-anon @decision-needed @e2e @desktop
  Scenario: LA-ANON-11 Logging in brings the visitor back
    Given the login prompt is shown on "/Genesis.1"
    When the visitor clicks "Log in or sign up"
    Then the login page opens, with no assistant on it
    When the visitor logs in within 30 minutes
    Then they land back on "/Genesis.1" with the assistant open on their conversation
    And the text box is enabled

  @scope-anon @spec-gap @e2e @desktop
  Scenario: LA-GAP-4 First questions move into history after login
    Given a logged-out visitor asked 2 questions
    When the visitor logs in
    Then that conversation appears in their chat history

  # Changing the free-answer limit: spec 3.1 wants it in remote config, taking effect at
  # once. The PRs set it on the server, so changing it needs a deploy.

  @scope-anon @spec-gap @e2e @desktop
  Scenario: LA-GAP-3 The free-answer limit changes without a deploy
    Given the limit is changed from 2 to 3 in remote config
    When a new logged-out visitor arrives
    Then they get 3 free answers
