# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Phones". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: The assistant on phones

  Background:
    Given the window is 393px wide on a touch device

  @scope-mobile
  Scenario Outline: LA-PHONE-1 Width decides the layout
    Given the window is <width> wide
    When the visitor opens the assistant
    Then it opens as <layout>

    @e2e
    Examples:
      | width | layout                   |
      | 600px | a full-screen sheet      |
      | 601px | a floating panel         |

  @scope-mobile @e2e
  Scenario: LA-PHONE-11 A phone held sideways gets the sheet
    Given the window is 852px wide and 393px tall
    When the visitor opens the assistant
    Then it opens as a full-screen sheet

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-2 Opening covers the page
    When the visitor taps the Ask button
    Then the assistant covers the whole screen
    And the page behind it does not scroll
    And the keyboard does not open by itself

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-3 A link in an answer leads to its page
    Given an answer with a link to "Shabbat 23b"
    When the visitor taps the link
    Then the assistant closes while Shabbat 23b loads
    When the visitor opens the assistant again
    Then it covers Shabbat 23b and shows the same conversation

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-3b Back after following a link skips the assistant
    Given the visitor is on the homepage and opens the assistant
    When the visitor taps a link to "Shabbat 23b" in an answer
    And presses Back on Shabbat 23b
    Then the homepage shows and the assistant stays closed

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-4 History or conversation, not both
    Given a signed-in visitor with saved chats
    When the visitor opens chat history
    Then history fills the sheet and the conversation is hidden
    When the visitor picks a chat
    Then that conversation fills the sheet

  @scope-mobile
  Scenario Outline: LA-PHONE-5 Ways to close the sheet
    Given the sheet is open
    When the visitor <action>
    Then the sheet closes and the Ask button is shown

    @e2e @phone
    Examples:
      | action                                        |
      | taps the minimize (–) button                  |
      | drags the top bar down more than 120px        |
      | flicks the top bar down quickly               |
      | presses the phone's Back button               |

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-6 Back works normally after the assistant is closed
    Given the visitor opened and then closed the sheet
    When the visitor presses Back
    Then the browser goes to the previous page in one press

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-7 A short drag springs back
    Given the sheet is open
    When the visitor drags the top bar down 60px and lets go
    Then the sheet slides back to full screen over 0.2s

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-8 The drag handle
    Then a 36 × 5px grey bar (#CCCCCC) is centered at the top of the sheet
    And while the sheet is dragged its top corners round to 16px

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-9 Sized for touch
    When the sheet is open
    Then every button is at least 44 × 44px and menu rows are at least 48px tall
    And every text field uses at least 16px text, so the phone does not zoom in
    And text is one step larger than on desktop (14 / 16 / 18px instead of 12 / 14 / 16px)
    And answer headings sit 16px below the text above and 6px above their text

  @scope-mobile @e2e @phone
  Scenario: LA-PHONE-10 No sidebar option on phones
    When the visitor opens the More options menu
    Then it has no option to move the assistant to the sidebar
