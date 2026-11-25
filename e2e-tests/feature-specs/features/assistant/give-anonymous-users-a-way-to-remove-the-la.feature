# Behavior spec for sc-48380, from the approved behavior stories (LA-HIDE-1 to 39, Q1 and Q2):
# https://claude.ai/artifact/F4hNdWSteoa1dnJ5zJyn18
# Approved by Penina, 2026-11-18.
#
# Words in quotes are the English copy. The steps read the copy by translation key, so a copy
# edit in Weblate doesn't break a scenario.
#
# "A new account" is a fresh test account made for that scenario, so scenarios that change the
# account's saved choice never affect each other. Those run only where test accounts can be made
# (local and integration runs, with MOBILE_APP_KEY set).
#
# Stories tagged both @desktop and @phone run on desktop; the phone behaviors are the @mobile
# scenarios below. The manual checks (real phones, VoiceOver) stay in the stories doc.

@sc-48380
Feature: Hide or show the Ask button
  Since the Library Assistant opened to everyone, its floating "✦ Ask" button can cover the
  page. Anyone can hide it from the assistant's More options menu, and turn it back on there.

  # ---- The menu item -------------------------------------------------------------------

  Scenario Outline: LA-HIDE-1 The menu item says what it will do
    Given <who>
    And the Ask button is <state>
    When I open the assistant's More options menu
    Then the menu has a "<label>" item with an <icon> icon

    Examples:
      | who                                  | state  | label           | icon       |
      | I am a logged-out visitor            | shown  | Hide Ask button | eye-off    |
      | I am a logged-out visitor            | hidden | Show Ask button | eye        |
      | I am logged in to a new account      | shown  | Hide Ask button | eye-off    |
      | I am logged in to a new account      | hidden | Show Ask button | eye        |

  Scenario: LA-HIDE-2 The last item for logged-out visitors
    Given I am a logged-out visitor
    When I open the assistant's More options menu
    Then the "Hide Ask button" item comes right after the "Help" item
    And the "Hide Ask button" item is the last item

  Scenario: LA-HIDE-3 Just above "Disable in settings" for logged-in users
    Given I am logged in to a new account
    When I open the assistant's More options menu
    Then the "Hide Ask button" item comes right after the "Help" item
    And the "Disable in settings" item comes right after the "Hide Ask button" item
    And the "Disable in settings" item is the last item

  Scenario Outline: LA-HIDE-4 The menu item opens the setting
    Given I am a logged-out visitor
    And the Ask button is <state>
    When I open the assistant's More options menu
    And I choose the "<label>" item
    Then the menu closes
    And the "Hide or show Ask button" dialog opens over the assistant
    And the dialog has a switch labelled "Show the Ask button" that is <switch>
    And the dialog has a "Done" button

    Examples:
      | state  | label           | switch |
      | shown  | Hide Ask button | on     |
      | hidden | Show Ask button | off    |

  # ---- Hiding and showing ----------------------------------------------------------------

  Scenario: LA-HIDE-5 Turning the switch off hides the Ask button
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    When I turn the switch off
    Then the switch is off
    And the assistant is open
    When I press "Done"
    Then the dialog closes
    And the assistant is open
    When I close the assistant
    Then I see no Ask button

  Scenario: LA-HIDE-6 Done never closes the assistant
    Given I am a logged-out visitor
    And I have asked the assistant "What is Shabbat?"
    And the "Hide or show Ask button" dialog is open
    When I press "Done"
    Then the dialog closes
    And the assistant is open, still showing "What is Shabbat?"

  Scenario: LA-HIDE-7 Hidden on every page
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I open the Library page "/texts"
    Then I see no Ask button
    When I open the Library page "/Genesis.1"
    Then I see no Ask button
    When I open the Library page "/topics/shabbat"
    Then I see no Ask button

  Scenario: LA-HIDE-8 The site header still opens the assistant
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I click the Library Assistant item in the site header
    Then the assistant is open

  Scenario: LA-HIDE-10 Turning it back on
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I click the Library Assistant item in the site header
    And I open the assistant's More options menu
    And I choose the "Show Ask button" item
    And I turn the switch on
    And I press "Done"
    And I close the assistant
    Then I see the Ask button in the bottom corner

  Scenario: LA-HIDE-11 The switch works from the keyboard
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    Then the control is a switch that says it is on
    When I move focus to the switch and press Space
    Then the switch is off
    When I press "Done"
    And I close the assistant
    Then I see no Ask button

  Scenario: LA-HIDE-36 The switch stays visible in both states
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    Then the switch is visible, filled in Sefaria blue, with its knob on the "on" side
    When I turn the switch off
    Then the switch is visible, gray, with its knob on the "off" side

  # ---- The dialog, logged out ------------------------------------------------------------

  Scenario: LA-HIDE-12 Logged out: the main menu stays
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    Then the dialog says "You can continue to open the Library Assistant from the main menu."

  Scenario: LA-HIDE-13 Logged out: how to remove it from the main menu
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    Then the dialog says "To remove the Library Assistant from the main menu, sign up or log in."
    And the dialog's links are "sign up" then "log in"

  Scenario: LA-HIDE-14 Sign up goes straight to signing up, set to come back
    Given I am a logged-out visitor
    And I open the Library page "/Genesis.1"
    And the "Hide or show Ask button" dialog is open
    When I click the "sign up" link in the dialog
    Then Sefaria's sign-up page opens, set to bring me back to "/Genesis.1"

  Scenario: LA-HIDE-15 Log in goes straight to logging in, then back
    Given I am a logged-out visitor
    And I open the Library page "/Genesis.1"
    And the "Hide or show Ask button" dialog is open
    When I click the "log in" link in the dialog
    Then Sefaria's login page opens, set to bring me back to "/Genesis.1"
    When I log in there with a new account
    Then I am back on "/Genesis.1"

  # ---- The dialog, logged in -------------------------------------------------------------

  Scenario: LA-HIDE-16 Logged in: the main menu stays
    Given I am logged in to a new account
    And the "Hide or show Ask button" dialog is open
    Then the dialog says "You can continue to open the Library Assistant from the main menu."

  Scenario: LA-HIDE-17 Logged in: where to remove it from the main menu
    Given I am logged in to a new account
    And the "Hide or show Ask button" dialog is open
    Then the dialog says "You can remove the Library Assistant from the main menu in settings."
    And the dialog's only link is "settings"

  Scenario: LA-HIDE-18 The settings link goes straight to the Library Assistant setting
    Given I am logged in to a new account
    And the "Hide or show Ask button" dialog is open
    When I click the "settings" link in the dialog
    Then the account settings page opens with the Library Assistant setting in view

  # ---- Saved choice, logged out ----------------------------------------------------------

  Scenario: LA-HIDE-19 Kept across reloads and tabs
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I reload the page
    Then I see no Ask button
    When I open Sefaria in a new tab
    Then I see no Ask button

  Scenario: LA-HIDE-20 Kept on a later visit
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I close Sefaria and come back later in the same browser
    Then I see no Ask button

  Scenario: LA-HIDE-21 Not carried to another browser
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I open Sefaria logged out in a different browser
    Then I see the Ask button

  Scenario: LA-HIDE-22 Logging out in this browser clears it
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I log in to a new account and then log out
    Then I see the Ask button

  # ---- Saved choice, logged in -----------------------------------------------------------

  Scenario: LA-HIDE-23 Follows the user to another browser
    Given I am logged in to a new account
    And the Ask button is hidden
    When I log in to the same account in a different browser
    Then I see no Ask button

  Scenario: LA-HIDE-24 Showing it again also follows them
    Given I am logged in to a new account
    And the Ask button is hidden
    And I am logged in to the same account in a different browser
    When I go back to the first browser and turn the Ask button back on
    And I go to the other browser and reload the page
    Then I see the Ask button

  Scenario Outline: LA-HIDE-25 The account wins over the browser
    Given I am logged in to a new account
    And my account has the Ask button <account>
    And this browser last had the Ask button <browser>
    When I open the Library page "/Genesis.1"
    Then the Ask button is now <result>

    Examples:
      | account | browser | result |
      | hidden  | shown   | hidden |
      | shown   | hidden  | shown  |

  Scenario: LA-HIDE-26 Logging out and back in
    Given I am logged in to a new account
    And the Ask button is hidden
    When I log out
    Then I see the Ask button
    When I log back in
    Then I see no Ask button

  # ---- What doesn't change ---------------------------------------------------------------

  Scenario Outline: LA-HIDE-27 The site header item doesn't change
    Given I am a logged-out visitor
    And the Ask button is <state>
    When I open the Library page "/Genesis.1"
    Then the site header shows its usual Library Assistant item

    Examples:
      | state  |
      | shown  |
      | hidden |

  Scenario: LA-HIDE-28 "Disable in settings" is unchanged
    Given I am logged in to a new account
    When I open the assistant's More options menu
    And I choose the "Disable in settings" item
    Then the address contains "/settings/account"

  Scenario: LA-HIDE-29 Turning the assistant off still removes it completely
    Given I am logged in to a new account
    And I have turned the Library Assistant off in my account settings
    When I open the Library page "/Genesis.1"
    Then I see no Ask button
    And the site header has no Library Assistant item

  Scenario: LA-HIDE-30 No relabelled button on a search with no results
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I search for something with no results
    Then I see no "Search with Library Assistant" button
    When I click "Library Assistant" in the no-results text
    Then the assistant asks about that search

  Scenario: LA-HIDE-31 No answer-ready badge, but the answer is waiting
    Given I am a logged-out visitor
    And the Ask button is hidden
    And I asked a question and closed the assistant before the answer came
    When the answer arrives
    Then no badge is shown in the bottom corner
    When I click the Library Assistant item in the site header
    Then the assistant shows the answer

  # ---- Decided cases (Q1, Q2) --------------------------------------------------------------

  Scenario: LA-HIDE-Q1 Logging in when the account never chose
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I log in to a new account
    Then I see the Ask button

  Scenario: LA-HIDE-Q2 Turning the assistant back on shows the Ask button
    Given I am logged in to a new account
    And the Ask button is hidden
    And I have turned the Library Assistant off in my account settings
    When I turn the Library Assistant back on in my account settings
    And I open the Library page "/Genesis.1"
    Then I see the Ask button

  # ---- Hebrew ------------------------------------------------------------------------------

  Scenario: LA-HIDE-32 Hebrew copy
    Given I am a logged-out visitor
    And the interface language is Hebrew
    When I open the assistant's More options menu
    Then the menu item reads in Hebrew
    When I choose the "Hide Ask button" item
    Then every label in the dialog reads in Hebrew

  Scenario: LA-HIDE-33 Right to left
    Given I am a logged-out visitor
    And the interface language is Hebrew
    And the "Hide or show Ask button" dialog is open
    Then the dialog's text is right-aligned and reads right to left
    And the switch's knob is on the left, its "on" side in Hebrew
    And the "sign up" link comes before the "log in" link, reading right to left

  # ---- Click names for analytics ----------------------------------------------------------

  Scenario: LA-HIDE-37 The menu item has one name in both states
    Given I am a logged-out visitor
    When I open the assistant's More options menu
    Then the "Hide Ask button" item is named "Hide or show Ask button" for analytics
    When I choose the "Hide Ask button" item
    And I turn the switch off
    And I press "Done"
    And I open the assistant's More options menu
    Then the "Show Ask button" item is named "Hide or show Ask button" for analytics

  Scenario: LA-HIDE-38 Choosing the menu item is recorded
    Given I am a logged-out visitor
    When I open the assistant's More options menu
    And I choose the "Hide Ask button" item
    Then analytics records a click named "Hide or show Ask button"

  Scenario Outline: LA-HIDE-39 The switch is named for what pressing it does
    Given I am a logged-out visitor
    And the Ask button is <state>
    And the "Hide or show Ask button" dialog is open
    Then the switch is named "<name>" for analytics
    When I press the switch
    Then analytics records a click named "<name>"
    And the "Hide or show Ask button" dialog is still open

    Examples:
      | state  | name            |
      | shown  | Hide Ask button |
      | hidden | Show Ask button |

  # ---- Phones ------------------------------------------------------------------------------

  @mobile
  Scenario: LA-HIDE-5 (phone) Hiding the Ask button
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    When I turn the switch off
    And I press "Done"
    And I close the assistant
    Then I see no Ask button

  @mobile
  Scenario: LA-HIDE-9 The hamburger menu still opens the assistant
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I choose Library Assistant from the hamburger menu
    Then the assistant is open

  @mobile
  Scenario: LA-HIDE-27 (phone) The hamburger menu item doesn't change
    Given I am a logged-out visitor
    And the Ask button is hidden
    Then the hamburger menu shows its usual Library Assistant item

  @mobile
  Scenario: LA-HIDE-34 The dialog fits a phone
    Given I am a logged-out visitor
    And the "Hide or show Ask button" dialog is open
    Then the whole dialog is visible without scrolling sideways
    And the switch and the "Done" button are each at least 44px tall

  @mobile
  Scenario: LA-HIDE-35 Closing the sheet after hiding
    Given I am a logged-out visitor
    And the Ask button is hidden
    When I open the Library page "/Genesis.1"
    Then I see no Ask button
