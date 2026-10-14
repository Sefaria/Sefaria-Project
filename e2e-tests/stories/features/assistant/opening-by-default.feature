# CONTRACT FILE: Product-owned. Text copied verbatim from "Library Assistant behavior
# stories for automated tests" (claude.ai doc DmZAFyK5kQyLo5KdBV3gGm, rev 61, 2026-10-12),
# section "Opening by default". Only @scope-* tags (and @fail / @manual status tags) are added here.
# See e2e-tests/stories/README.md before editing.
Feature: Opening by default

  @scope-general
  Scenario Outline: LA-OPEN-1 First visit opens the assistant
    Given the visitor is <who> and has never closed the assistant in this browser
    And the window is <width> wide
    When a library page loads
    Then the assistant is open

    @e2e @fail
    Examples:
      | who                             | width  |
      | logged out                      | 1280px |

    @e2e
    Examples:
      | who                             | width  |
      | logged in with the assistant on | 1280px |

    @e2e @fail
    Examples:
      | who                             | width  |
      | logged out                      | 768px  |

  @scope-general @e2e @desktop
  Scenario: LA-OPEN-2 A closed assistant stays closed
    Given the visitor closed the assistant
    When the visitor loads another library page, or comes back another day in the same browser
    Then the assistant is closed and the Ask button is shown

  @scope-general @e2e @desktop
  Scenario: LA-OPEN-3 An assistant left open stays open
    Given the visitor opened the assistant and left it open
    When the visitor loads another library page
    Then the assistant is open

  @scope-mobile @e2e @phone
  Scenario: LA-OPEN-4 Phones never open it by themselves
    Given the visitor has never closed the assistant, or left it open last time
    When a library page loads on a phone
    Then the assistant is closed and the Ask button is shown
