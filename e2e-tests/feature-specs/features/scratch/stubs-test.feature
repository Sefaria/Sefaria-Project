Feature: Stub workflow test (throwaway, do not merge)

  Scenario: New desktop steps
    Given I am a logged-out visitor
    When I click the scratch test button
    Then I see the scratch test banner

  @mobile
  Scenario: New mobile step
    Given I am a logged-out visitor
    Then I see the scratch mobile drawer
    And I see the scratch amendment notice
