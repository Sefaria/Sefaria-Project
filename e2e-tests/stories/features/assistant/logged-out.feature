# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Logged-out visitors". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Logged-out use of the assistant

  Background:
    Given the visitor is logged out
    And the free-answer limit is 2

  @scope-anon @e2e @desktop @phone
  Scenario: LA-ANON-1 A logged-out visitor can ask questions
    When the visitor opens the assistant and asks a question
    Then an answer appears

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-2 The last free answer brings the login prompt
    Given the visitor has had 1 answer
    When the visitor asks a second question and its answer arrives
    Then the text box and send button are replaced by "To keep asking, log in or sign up for free." [assistant.anon.limit_reached]
    And a full-width "Log in or sign up" button [assistant.anon.login_button] is shown under it
    And the whole last answer can still be scrolled and read
    And keyboard focus does not move

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-3 Look of the login prompt
    Given the login prompt is shown
    Then its text is #575757 and centered
    And the button is #18345D with white text, 8px corners, 40px tall (44px on phones)
    And hovering the button turns it #465D7D
    And the prompt fades in, rising 6px, over 200ms (no motion with reduced motion)

  @scope-anon @e2e @phone
  Scenario: LA-ANON-4 On a phone the assistant stays open when the limit is reached
    Given the assistant is open on a phone and the visitor has had 1 answer
    When the second answer arrives
    Then the assistant is still open and shows the login prompt

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-5 The assistant stays as the visitor left it
    Given the visitor reached the limit
    When the visitor reloads the page or comes back later in the same browser
    Then the assistant is open or closed as they left it
    And when opened it shows their last conversation, scrolled to the end, with the login prompt

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-6 A visitor at the limit keeps their conversation however long ago it was
    Given the visitor reached the limit more than a day ago
    When the visitor opens the assistant
    Then their last conversation is shown with the login prompt

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-7 History is visible but locked
    When the visitor opens the assistant
    Then the chat history button is shown, faded, in the header
    And hovering it shows "Log in to see chat history" [assistant.header.history.login_tooltip]
    And clicking it does nothing

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-8 New chat is locked from the start
    Given the visitor has not asked anything yet
    When the visitor opens the More options menu
    Then "New chat" is shown but disabled
    And hovering it shows "Log in to start a new chat" [assistant.menu.restart.login_tooltip]

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-9 No "Disable in settings" for logged-out visitors
    When the visitor opens the More options menu
    Then it has no "Disable in settings" item

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-10 One chat only
    Given the visitor asked a question
    When the visitor asks another question
    Then both questions and answers are in the same conversation
    And there is no way to start a second conversation

  @scope-anon @e2e @desktop
  Scenario: LA-ANON-12 Limit reached in another tab
    Given the visitor used up the free answers in another tab
    And this tab still shows the text box
    When the visitor sends a question
    Then the login prompt appears, the same as when reaching the limit
    And no error message is shown
    And after logging in, the question is still in the text box
