# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Search with no results". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Search with no results

  @scope-general @fail
  Scenario Outline: LA-NULL-1 Assistant on: no button on the page, assistant copy
    Given the visitor is <who>
    When the visitor searches for "qqzzxxvvkk" and opens the <tab> tab
    Then no button is shown on the page itself
    And the text is the key search.null.<tab>.body.library_assistant
    And "Library Assistant" never breaks across two lines

    @e2e @desktop @phone
    Examples:
      | who                             | tab     |
      | logged out                      | sources |
      | logged in with the assistant on | books   |
      | logged in with the assistant on | authors |
      | logged in with the assistant on | topics  |

  @scope-general @fail
  Scenario Outline: LA-NULL-2 Assistant off: today's copy and Browse button
    Given the visitor is logged in with the assistant turned off
    When the visitor searches for "qqzzxxvvkk" and opens the <tab> tab
    Then one button is shown, linking to <href>
    And the text is the key search.null.<tab>.body

    @e2e @desktop
    Examples:
      | tab     | href    |
      | sources | /texts  |
      | books   | /texts  |
      | authors | /people |
      | topics  | /topics |

  @scope-general @e2e @desktop @fail
  Scenario: LA-NULL-3 Neither version flashes first
    When an empty search tab first appears
    Then the Browse button and the text never show in the wrong version, even for a moment

  @scope-general @e2e @desktop @phone @fail
  Scenario: LA-NULL-5 The Ask button becomes the search action
    Given the assistant is on and closed
    When the visitor searches for "qqzzxxvvkk" with no results
    Then the Ask button reads "Search with Library Assistant" [assistant.floating_button.search_label], keeping its star
    And its width grows smoothly over 200ms (no animation with reduced motion)

  @scope-general @e2e @desktop @fail
  Scenario: LA-NULL-6 Clicking it asks about the search
    Given the button reads "Search with Library Assistant" for "qqzzxxvvkk"
    When the visitor clicks it
    Then the assistant opens
    And it sends the question wrapper with "qqzzxxvvkk" filled in ("I searched for \"{query}\" on Sefaria and got no results…"; not in Weblate yet, so read it from the spec until it has a key)
    And the open assistant starts working on it almost at once, showing that it's thinking

  @scope-general @e2e @desktop @fail
  Scenario: LA-NULL-7 Signed in: the question starts a new chat
    Given a signed-in visitor with an earlier conversation open
    When the visitor clicks "Search with Library Assistant"
    Then the question is asked in a new chat
    And the earlier conversation is still in chat history

  @scope-anon @e2e @desktop
  Scenario: LA-NULL-8 Logged out: the question goes into the visitor's one chat
    Given a logged-out visitor with free answers left and an earlier question in their chat
    When the visitor clicks "Search with Library Assistant"
    Then the question is added to the same conversation, under the earlier one

  @scope-anon @e2e @desktop
  Scenario: LA-NULL-9 Logged out at the limit: nothing is sent
    Given a logged-out visitor with no free answers left
    When the visitor clicks "Search with Library Assistant"
    Then the assistant opens on their last conversation, scrolled to the end, with the login prompt
    And no question is sent

  @scope-anon @e2e @desktop
  Scenario: LA-NULL-10 The search question never uses up the last free answer
    Given a logged-out visitor who asked 1 question of their own (1 free answer left)
    When the visitor clicks "Search with Library Assistant"
    Then the question is answered and no login prompt appears
    When the visitor then asks a question of their own
    Then it is answered and the login prompt appears

  @scope-anon @e2e @desktop
  Scenario: LA-NULL-11 That exception happens once per visitor
    Given a logged-out visitor already had one search question that didn't count
    And has 1 free answer left
    When the visitor clicks "Search with Library Assistant" on a new search
    Then the question is answered and the login prompt appears

  @scope-anon @e2e @desktop
  Scenario: LA-NULL-12 A search question counts like any other when it isn't the last
    Given a logged-out visitor with 2 free answers left
    When the visitor clicks "Search with Library Assistant"
    Then the visitor has 1 free answer left

  @scope-general @e2e @desktop @fail
  Scenario: LA-NULL-13 It asks once per search
    Given the visitor clicked "Search with Library Assistant" for "qqzzxxvvkk"
    When the visitor closes the assistant and clicks the button again
    Then the assistant reopens on the same chat and no second question is sent
    When the visitor switches to another empty tab of the same search
    Then the button keeps its label without flickering back to "Ask"
    And clicking it sends nothing new
    When the visitor searches for something else with no results and clicks it
    Then the new search is asked once

  @scope-general @e2e @desktop @fail
  Scenario: LA-NULL-14 Results bring back "Ask"
    Given the button reads "Search with Library Assistant"
    When the visitor moves to a tab with results, or leaves the search page
    Then the button reads "Ask" again

  @scope-general @e2e @desktop @he @fail
  Scenario: LA-NULL-15 Hebrew interface
    Given the interface is Hebrew
    When the visitor searches for "qqzzxxvvkk" with no results
    Then the button shows the Hebrew value of [assistant.floating_button.search_label]
    And clicking it sends the Hebrew question wrapper with "qqzzxxvvkk" filled in
