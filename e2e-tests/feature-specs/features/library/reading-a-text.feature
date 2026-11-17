Feature: Reading a text in the Library
  A visitor can open a text by its citation and start reading it,
  without logging in.

  Scenario: A logged-out visitor opens a chapter by its address
    Given I am a logged-out visitor
    When I open the Library page "/Genesis.1"
    Then the page title contains "Genesis 1"
    And the reader shows the text of "Genesis 1:1"
