# Developer Settings (/settings/developer): API keys, projects and Powered by Sefaria.
# Story: https://app.shortcut.com/sefaria/story/48553
# Approved by Penina Levy on 2026-11-19 (73 scenarios):
#   https://docs.google.com/spreadsheets/d/1sSR66iqFT-UQsEf4k-XgA8dr8Ob_-LUtw21MSByws6g/edit
#
# How to read these scenarios:
# - Words in quotes are the English copy; the translation key follows in [brackets].
#   Steps read the value by key, never by matching English or Hebrew words, so copy edits in
#   Weblate don't break them.
# - Find controls by role, label key or data-agent-action (new-project, new-key, edit-project,
#   add-website, share-project, send-confirmation, resend-confirmation, get-started), never by
#   position or CSS class.
# - Scenarios with no @mobile tag run on desktop. @mobile runs on a phone. Where the approved
#   scenario applies to both, it says so in a comment above it ("Also on phones").
# - @he: the scenario is about the Hebrew interface.
# - Accounts: "a developer with a profile" has finished About you. "An email account" signed up
#   with email and password; "a Google account" signed in with Google (no email step).
# - Emails: steps that open a confirmation link read it from the test mailbox; on a local run,
#   from Django's email output.
# - Limits: 10 projects per account and 5 keys per project are the server's numbers today;
#   steps read them from the server's state, not from the copy.
# - Not covered: the Account tab, the API itself (rate limits, key checks beyond DS-KEY-8),
#   usage, the hidden instructions for AI agents, and how the screens look (checked by hand).

@sc-48553
Feature: Developer Settings
  Developers get a free Sefaria API key: they confirm their email, tell us about themselves,
  describe their project and create keys, and can submit a project to Powered by Sefaria.

  Rule: First-time setup
      # Also on phones
      Scenario Outline: DS-SETUP-1 Welcome lists the steps for the kind of account
        Given <account> with no developer profile
        When the visitor opens Developer Settings
        Then the page reads "Get a free API key" [developer.welcome.header]
        And it lists <count> steps, in order: <steps>
        And there is one "Get started" button [developer.welcome.get_started.button]

        Examples:
          | account          | count | steps                                                                 |
          | an email account | 4     | confirm_email, about_you, project, create_key (developer.welcome.steps.*) |

        # Amended 2026-11-19 (sc-48553): Google sign-in can't be automated, so this row is @manual. Approved by Penina Levy
        @manual
        Examples:
          | account          | count | steps                                                                 |
          | a Google account | 3     | about_you, project, create_key                                        |

      Scenario: DS-SETUP-2 Email accounts confirm their email first
        Given an email account with no developer profile
        When the visitor clicks "Get started"
        Then the page reads "Confirm your email" [developer.confirm_email.header]
        And it names the account's email address [developer.confirm_email.intro]
        When the visitor clicks "Send confirmation link" [developer.common.send_confirmation.button]
        Then the page reads "Check your email" [developer.common.check_email.header]
        And "Resend link" [developer.common.resend.button] is disabled, counting down from 60 seconds
        And there is no way back to the previous step

      Scenario: DS-SETUP-3 A live link sends returning visitors straight to "Check your email"
        Given an email account that asked for a confirmation link less than 3 days ago and hasn't opened it
        When the visitor opens Developer Settings and clicks "Get started"
        Then the page reads "Check your email"

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-4 Confirming moves setup on by itself
        Given an email account on "Check your email"
        When the visitor opens the confirmation link from the email
        Then the page reads "Thank you for confirming your email" [developer.link_pages.confirmed.header]
        When the visitor clicks "Continue to Developer Settings" [developer.link_pages.confirmed.continue.button]
        Then setup continues on "About you" [developer.about_you.header]
        And the step counter reads step 2 of 4

      # Also on phones
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-5 About you needs only the role
        Given the visitor is on "About you"
        When the visitor saves without choosing an answer to "What best describes you?"
        Then that question shows an error and nothing is saved
        When the visitor chooses "Somewhat technical" [developer.about_you.role.option_02] and saves
        Then setup continues on "Your project" [developer.project_form.header]

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-6 About you asks for a name only when the account has none
        Given an account with no name
        When the visitor reaches "About you"
        Then a required "Name" field [developer.about_you.name.label] is shown
        Given an account with a name
        Then no name field is shown, and the page shows the name and email it is signed in as
        And the email, with its parentheses, stays together: when it doesn't fit on the line, it moves to the next line whole

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-7 The newsletter box starts unticked
        Given the visitor is on "About you"
        Then the developer newsletter checkbox [developer.about_you.community.newsletter.label] is unticked
        And "Join our Discord" [developer.about_you.community.discord.join_discord_link] opens the Discord sign-up form in a new tab

      # Also on phones
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-8 Your project: required fields
        Given the visitor is on "Your project"
        When the visitor continues with every field empty
        Then "Project name", "What are you building?" and "Short description" show errors
        And "Organization/Company" and "Website" do not
        And the page scrolls to the first field with an error

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-9 What are you building? offers six options
        When the visitor opens "What are you building?" [developer.project_form.purpose.label]
        Then the options are developer.project_form.purpose.option_01 to option_06, in that order

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-10 Short description stops at 150 characters
        When the visitor types 160 characters into "Short description"
        Then only the first 150 are kept
        And the counter under the box reads 150/150

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @mobile @manual
      Scenario: DS-SETUP-11 On phones 150 characters fit without scrolling
        When the visitor types a 150-character description in ordinary words
        Then the whole description is visible in the box without scrolling

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-12 Skip for now on Your project
        Given the visitor is on "Your project"
        When the visitor clicks "Skip for now" [developer.common.skip.button]
        Then the profile is saved and the visitor lands on the Developer Settings home with no projects

      # Also on phones
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-13 Creating the first key
        Given the visitor saved "Your project" with the name "Verse a Day"
        Then the page reads "Create an API key for Verse a Day" [developer.key_form.intro]
        And "Limit this key to <site>" [developer.key_form.restrict_to_host.label] is off
        When the visitor names the key and clicks "Create API key" [developer.key_form.create.button]
        Then "Creating your key…" [developer.creating_key.header] shows for at least 4 seconds
        And the visitor lands on the home page with the new key's row scrolled into view
        And the row shows in its final look from the start: no highlight, flash or color change

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-14 Limiting the first key with no website asks for one
        Given the project has no website
        When the visitor turns on "Limit this key" on the key step
        Then the visitor is asked for the website, and the website they enter is saved to the project
        And the hint under the website field reads only "Includes www and any subdomain, like app.example.com." [developer.project_form.website.hint]

      # Also on phones
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-15 After confirming, the welcome screen keeps the confirm step, marked done
        Given an email account that confirmed its email and has no developer profile
        When the visitor opens Developer Settings
        Then the welcome screen lists 4 steps, and step 1 "Confirm your email" is gray with a green check after it
        When the visitor clicks "Get started"
        Then setup opens on "About you" and the step counter reads step 2 of 4
        Given an email account that hasn't confirmed
        Then step 1 shows as a normal step, with no check
        Given a Google or Apple account
        Then the welcome screen lists 3 steps and has no confirm step

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-16 The limit hint is one paragraph
        Given the visitor is on the key step
        Then under "Limit this key" one paragraph reads [developer.key_form.restrict.help]:
          """
          Turn this on if your key is going in your web page's code. Leave this off if your key is going on a server or in an AI tool. You can change this setting at any time in Developer Settings.
          """
        And "on" and "off" are bold

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-SETUP-17 A label's help icon comes before "Optional"
        Given the visitor is on "About you"
        Then the "Additional email address" label reads, in order: the label, the (?) help icon, then "Optional"

      # Also on phones
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @he @manual
      Scenario: DS-SETUP-18 A long step title never runs under the back arrow
        Given the visitor saved "Your project" with the name "Claude test project"
        Then the key step's title "Create an API key for Claude test project" and its step number "4" do not overlap the back arrow
        And the title stays centered

  Rule: Keys on the main page
      Background:
        Given a developer with a profile and a project "Verse a Day" with a key "Daily email"

      # Also on phones
      Scenario: DS-KEY-1 A hidden key shows only its start
        Then the key reads its first 10 characters ("sfr_" and 6 more) followed by four dots
        And the full key is not in the page or in the page's data

      Scenario: DS-KEY-2 Show and hide
        When the developer clicks "Show key, Daily email" [developer.home.key.show.aria]
        Then the full key is shown
        When the developer clicks "Hide key, Daily email" [developer.home.key.hide.aria]
        Then only the start shows again, and the full key is gone from the page

      # Also on phones
      Scenario: DS-KEY-3 Copy confirms with an icon, not text
        When the developer clicks "Copy key, Daily email" [developer.home.key.copy.aria] while the key is hidden
        Then the clipboard holds the full key
        And the copy icon turns into a green check for 8 seconds, then turns back
        And screen readers hear "Copied" [developer.home.key.copied.aria]
        And no visible "Copied" text appears
        And the key on screen stays hidden

      Scenario: DS-KEY-4 Delete a key
        When the developer clicks "Delete key, Daily email" [developer.home.key.delete.aria]
        Then a window asks "Delete Daily email?" [developer.delete_key_dialog.header]
        And it says "Anything using this key stops working right away. You can't undo this action." [developer.delete_key_dialog.body]
        And "Cancel" comes first and the red "Delete" last
        When the developer clicks "Delete" [developer.delete_key_dialog.confirm.button]
        Then the key's row disappears
        And no success message appears
        And the key no longer works against the API

      Scenario: DS-KEY-5 Cancel keeps the key
        When the developer opens "Delete key, Daily email" and clicks "Cancel"
        Then the window closes, the key is still listed, and focus is back on the delete button

      # Also on phones
      Scenario: DS-KEY-6 Add a key
        When the developer clicks "Add key" [developer.home.project.add_key.button] on Verse a Day
        Then the page reads "Create an API key for Verse a Day", with no step counter and a back link to the projects
        When the developer names the key "Staging" and creates it
        Then the home page lists "Staging" under Verse a Day, scrolled into view
        And the new row shows in its final look from the start: no highlight, flash or color change

      Scenario: DS-KEY-7 Key name is required and at most 100 characters
        When the developer creates a key with an empty name
        Then the name field shows an error and no key is created
        When the developer types 110 characters
        Then only 100 are kept

      Scenario: DS-KEY-8 Limit to website, when the project has one
        Given Verse a Day's website is example.com
        When the developer turns on "Limit Daily email to your website" [developer.home.key.restrict.aria]
        Then the switch stays on after a reload, with no message
        And the key works from example.com and its subdomains and is refused from other sites

      Scenario: DS-KEY-9 Limit to website, when the project has none
        Given Verse a Day has no website
        When the developer turns on the switch for Daily email
        Then a window "Limit this key to your website" opens, asking for the website
        And the hint under the field reads only [developer.project_form.website.hint], with no "We'll add it to the project's details."
        And "Limit key" [developer.limit_key_dialog.confirm.button] is disabled until something is typed
        When the developer types "https://www.example.com/page" and clicks "Limit key"
        Then the project's website is saved as "example.com" and the switch is on
        When the developer opens the window again and clicks "Cancel"
        Then the switch stays as it was

      # Also on phones
      Scenario: DS-KEY-10 The 5-key limit
        Given Verse a Day has 5 keys
        Then "Add key" is unavailable but can still be focused
        And on desktop, hovering or focusing it shows the tooltip [developer.home.key_limit_reached.tooltip]
        And on phones, that reason shows as text under the button
        And deleting one key makes "Add key" available again

      Scenario: DS-KEY-11 Long key names
        Given a key whose name is longer than its column
        Then the name stays on one line and ends in "…"
        And hovering it shows the whole name

      @mobile
      Scenario: DS-KEY-12 Phones get the phone layout on a full page load
        Given the developer is on a phone (390px wide)
        When the developer loads /settings/developer directly (typed, or refreshed), not by navigating to it
        Then "Add key" on Verse a Day is a full-width button that can be tapped
        And the ⋮ menu sits at the top corner of the project, on the same line as its name
        When the developer taps ⋮ [developer.home.project_menu.open.aria]
        Then a closed menu opens with Edit project details, Add website or the website, and Publish project or Submitted for review
        And the menu's options are not shown as rows on the page before ⋮ is tapped
        And when Verse a Day has a website, its link under the description is there from the first paint, so "Add key" doesn't move down after the page loads

  Rule: Projects
      # Also on phones
      Scenario: DS-PROJ-1 No projects yet
        Given a developer with a profile and no projects
        Then the home page reads "No projects or keys yet" [developer.home.empty.header]
        And there is a "Create a project" button [developer.home.empty.create_project.button]

      # Also on phones
      Scenario: DS-PROJ-2 New project
        Given a developer with a profile
        When the developer clicks "New project" [developer.home.new_project.button]
        Then the project form opens with no step counter and a back link to the projects
        When the developer fills in the required fields and saves
        Then the key step for the new project opens

      Scenario: DS-PROJ-3 Edit a project
        Given a project "Verse a Day"
        When the developer clicks "Edit project details" [developer.home.project.edit_details.button]
        Then the page reads "Edit Verse a Day" [developer.edit_project.intro], with every field filled in, including the saved answer to "What are you building?"
        When the developer changes the description and clicks "Save project" [developer.edit_project.save.button]
        Then the home page shows the new description
        And no success message appears

      Scenario: DS-PROJ-4 Website is cleaned to its domain
        When the developer types "https://www.Example.com/about?x=1" in Website and leaves the field
        Then the field reads "example.com"
        When the developer types "not a website" and leaves the field
        Then the field shows an invalid-website error

      Scenario: DS-PROJ-5 The website shows as a link
        Given Verse a Day's website is example.com
        Then the project shows "example.com" as a link that opens the site in a new tab
        Given a project with no website
        Then it shows "Add website" [developer.home.project_menu.add_website.button] instead
        # Amended 2026-11-24 (sc-48553): "Add website" opens the Add your website window; the app is right, approved by Penina Levy
        When the developer clicks "Add website"
        Then a window asks "Add your website" [developer.limit_key_dialog.add_website.header]
        When the developer types "example.com" in "Your website" [developer.common.your_website.label] and clicks "Save website" [developer.limit_key_dialog.save_website.button]
        Then the project shows "example.com" as a link that opens the site in a new tab

      Scenario Outline: DS-PROJ-6 Delete a project
        Given a project "Verse a Day" with <keys>
        When the developer clicks "Delete this project" [developer.edit_project.delete.button]
        Then a window asks "Delete the project Verse a Day?" [developer.delete_project_dialog.header]
        And it says <body>
        And focus starts on "Cancel"
        When the developer clicks "Delete project" [developer.delete_project_dialog.confirm.button]
        Then the project and its keys are gone from the home page, and those keys no longer work

        Examples:
          | keys        | body                                                                                  |
          | one key     | [developer.delete_project_dialog.key_list.body_one] and that key's name               |
          | two keys    | [developer.delete_project_dialog.key_list.body_other] and both keys' names            |
          | no keys     | [developer.delete_project_dialog.undo_warning.note] and no list                       |

      Scenario: DS-PROJ-7 Removing a website that keys are limited to
        Given Verse a Day's website is example.com and "Daily email" is limited to it
        When the developer empties the Website field and saves
        Then a window asks "Remove the website?" [developer.remove_site_dialog.header]
        And it lists "Daily email" under [developer.remove_site_dialog.key_list.body] with example.com
        When the developer clicks "Keep the website" [developer.remove_site_dialog.cancel.button]
        Then the project's other changes are saved and the website stays
        When the developer empties the website again and clicks "Remove the website" [developer.remove_site_dialog.confirm.button]
        Then the website is removed and Daily email's limit is off, in the same save

      Scenario: DS-PROJ-8 Removing a website no key uses
        Given a project with a website and no limited keys
        When the developer empties the Website field and saves
        Then the website is removed with no window

      # Also on phones
      Scenario: DS-PROJ-9 The 10-project limit
        Given a developer with 10 projects
        Then "New project" is unavailable but can still be focused
        And on desktop its tooltip says [developer.home.project_limit_reached.tooltip], with developers@sefaria.org as an email link
        And on phones that reason shows as text under the button

      Scenario: DS-PROJ-10 Projects can't move between accounts
        When the developer opens a project form
        Then the note [developer.project_form.account_note.note] is shown

      Scenario: DS-PROJ-11 "What are you building?" is required for every project
        Given a project "Verse a Day" with no answer to "What are you building?" (made before answers were saved)
        When the developer opens "Edit project details" and saves without choosing one
        Then "What are you building?" shows an error and nothing is saved
        When the developer chooses "Research" and saves
        Then reopening "Edit project details" shows "Research"

  Rule: Publish a project on Powered by Sefaria
      # Also on phones
      Scenario: DS-PUB-1 From a project
        Given a developer with a project "Verse a Day" that has a website and a description
        When the developer clicks "Publish project" [developer.home.project_menu.publish.button] on Verse a Day
        Then "Publish your project" [developer.publish_form.header] opens with Verse a Day chosen
        And "About you" comes first, as a filled-in summary with "Edit"
        And "Show my name with the project if it's featured" [developer.publish_form.show_name.label] is unticked

      Scenario: DS-PUB-2 From the header link: choose a project
        Given a developer with two projects
        When the developer clicks "Publish a project" [developer.frame.publish_project.button]
        Then the form asks "Which project do you want to publish?" [developer.publish_form.project_picker.label]
        And the list includes "+ Create a new project" [developer.publish_form.project_picker.option.new_project]

      Scenario: DS-PUB-3 Create a project inside the form
        When the developer chooses "+ Create a new project"
        Then empty project fields open inside the form
        And the submit button reads "Create project + submit" [developer.publish_form.create_and_submit.button]
        When the developer fills in the form and submits
        Then the new project is created with no key, and submitted for review

      # Also on phones
      Scenario: DS-PUB-4 Required answers
        When the developer submits with no project category chosen
        Then "What kind of project is it?" shows [developer.publish_form.category.error]
        And the page scrolls to it
        And website, short description and "What are you building?" are required here

      Scenario: DS-PUB-5 Changes here update the project
        When the developer edits the project's description in the publish form and submits
        Then the project's description on the home page is the new one

      # Also on phones
      Scenario: DS-PUB-6 Submitted
        When the developer submits a complete form for Verse a Day
        Then the page reads "Your project was submitted for review" [developer.publish_submitted.header]
        And it names Verse a Day and links to the Powered by Sefaria site
        When the developer clicks "Back to Developer Settings" [developer.common.back_to_settings.button]
        Then Verse a Day shows "Submitted for review" [developer.home.project_menu.submitted.note] instead of "Publish project"
        And on desktop it is a note, not a button: gray text with a green check, and hovering it changes nothing

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-PUB-7 The Powered by link with no profile yet
        Given a signed-in visitor with no developer profile
        When the visitor opens /settings/developer?share
        Then a window reads "Looking to publish your project?" [developer.publish_form.setup_first_dialog.header] over the welcome screen
        When the visitor clicks "Got it" [developer.publish_form.setup_first_dialog.confirm.button] and finishes About you and Your project
        Then setup ends on the publish form for that project, with no key step

      # Amended 2026-11-25 (sc-48553): tool names and link names come from Weblate, approved by Penina Levy
      Scenario: DS-PUB-8 Each tool option links to its page
        When the developer looks at "Which Sefaria data or tools did you use for your project?" [developer.publish_form.sefaria_tools.label]
        Then the options read [developer.publish_form.sefaria_tools.option_01] to [developer.publish_form.sefaria_tools.option_11], in that order
        And each option except "Other" [developer.publish_form.sefaria_tools.option_11] links to its own page in a new tab
        And each link is named after its option, followed by "(opens in a new tab)" [developer.common.opens_in_new_tab.aria]

      Scenario: DS-PUB-9 Link to source code
        When the developer types "my repo" in "Link to source code" [developer.publish_form.source_code.label] and submits
        Then the field shows "Invalid link" [developer.publish_form.source_code.invalid.error], not "Invalid website"
        When the developer types "github.com/someone/verse-a-day" and submits
        Then the link is saved whole, with its path, as "https://github.com/someone/verse-a-day"

      Scenario: DS-PUB-10 A project picked from the header link keeps its saved answers
        Given a developer with a profile and a project "Verse a Day" whose answer to "What are you building?" is "Research"
        When the developer clicks "Publish a project", chooses Verse a Day, chooses a category and submits
        Then the project is submitted for review, with no error on "What are you building?"
        And its saved answer is still "Research"

      Scenario: DS-PUB-11 A project with no answer opens its details
        Given a project "Verse a Day" with no answer to "What are you building?"
        When the developer opens the publish form for it
        Then the project's fields are open, not a summary, and "What are you building?" is empty
        When the developer submits without choosing one
        Then "What are you building?" shows an error and nothing is sent

      Scenario: DS-PUB-12 Publish answers are saved and come back
        Given the developer submitted Verse a Day with categories, tools, a link to source code and "Anything else" [developer.publish_form.anything_else.label] filled in
        When the developer opens the publish form for Verse a Day again
        Then every answer shows as it was submitted, including "Anything else"
        And staff notes on the project are never shown to the developer

      # Added 2026-11-25 (sc-48553): tool names in Hebrew, approved by Penina Levy
      @he
      Scenario: DS-PUB-13 Tool options in Hebrew
        Given the interface language is Hebrew
        When the developer looks at "Which Sefaria data or tools did you use for your project?" [developer.publish_form.sefaria_tools.label]
        Then each option shows its Hebrew value [developer.publish_form.sefaria_tools.option_01 … option_11]
        And each link is named after its option's Hebrew value, followed by the Hebrew "(opens in a new tab)" [developer.common.opens_in_new_tab.aria]
        And an option ticked in Hebrew is saved the same as in English

  Rule: Email confirmation links and changing the account email
      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-EMAIL-1 The confirmation email
        When an email account asks for a confirmation link
        Then one email arrives at the account's address
        And it has a button and the link written out, and says the link works for 3 days

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @he @manual
      Scenario: DS-EMAIL-2 Hebrew email
        Given the interface language is Hebrew
        When the visitor asks for a confirmation link
        Then the email's subject and text are in Hebrew and read right to left

      Scenario: DS-EMAIL-3 One link a minute
        Given the visitor just sent a confirmation link
        Then "Resend link" stays disabled for 60 seconds, showing [developer.common.resend_wait.button]
        And after 60 seconds it can be clicked and sends a new link

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario Outline: DS-EMAIL-4 Link pages
        Given <situation>
        When the visitor opens the link
        Then the page reads <header>
        And its button is <button>

        Examples:
          | situation                                         | header                                                   | button                                                        |
          | a link already used to confirm this address       | [developer.link_pages.already_confirmed.header]          | [developer.link_pages.confirmed.continue.button]              |
          | a link older than 3 days                          | [developer.link_pages.expired.header]                    | [developer.link_pages.expired.send_new.button]                |
          | a link for an address no longer on the account    | [developer.link_pages.expired.header]                    | [developer.link_pages.expired.send_new.button], to Developer Settings |
          | a link for an address another account now uses    | [developer.link_pages.expired.header]                    | [developer.link_pages.expired.send_new.button], to Developer Settings |

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-EMAIL-5 A new link from an expired one
        Given an expired link
        When the visitor clicks "Send a new link"
        Then the page reads "Check your email" with [developer.link_pages.resent.body]
        And a new email arrives at the account's address

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-EMAIL-6 Changing the account email after setup
        Given a developer with projects and keys
        When the developer changes the account email in Account Settings and opens Developer Settings without reloading
        Then projects and keys still show and keep working
        And a banner reads "Confirm your email address" [developer.banners.reconfirm.header] with "Send confirmation link", and no close button
        And "New project", "Create a project" and "Add key" are unavailable, saying [developer.common.confirm_email_first]
        And editing, deleting and limiting keys still work

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-EMAIL-7 Confirming the new address from the banner
        Given the banner is showing
        When the developer clicks "Send confirmation link"
        Then the banner reads "Check your email" with the new address [developer.banners.reconfirm.sent.body] and a 60-second resend
        When the developer leaves and comes back
        Then the banner is still in that state
        When the developer opens the link from the new address's inbox
        Then back in Developer Settings the banner is gone and the create buttons work

      # Amended 2026-11-19 (sc-48553): skipped (@manual) until the tests can open a confirmation email; Penina asked Daniel how. Approved by Penina Levy
      @manual
      Scenario: DS-EMAIL-8 The old address stops working
        Given the developer changed the account email
        Then logging in with the old address fails

      Scenario: DS-EMAIL-9 Daily link limit
        Given the visitor has asked for the most links allowed today
        When the visitor asks for another
        Then [developer.errors.daily_link_limit.error] shows under the button, with the number filled in

  Rule: Signing in, Back, Hebrew, phones and accessibility
      Scenario Outline: DS-NAV-1 Logged out, then back to Developer Settings
        Given a logged-out visitor
        When the visitor opens /settings/developer
        Then the login page shows "Looking for Developer Settings?" [developer.signin_notice.header]
        When the visitor <signs in>
        Then the visitor lands in Developer Settings

        Examples:
          | signs in                        |
          | logs in with email              |
          | creates a new account with email |

        # Amended 2026-11-19 (sc-48553): Google and Apple sign-in can't be automated, so these rows are @manual. Approved by Penina Levy
        @manual
        Examples:
          | signs in                        |
          | continues with Google           |
          | continues with Apple            |

      # Also on phones
      Scenario: DS-NAV-2 Back steps through the full-screen steps
        Given a developer on the home page
        When the developer opens "Edit project details", then the browser's Back
        Then the developer is on the home page, and the address is still /settings/developer
        When the developer finishes adding a key, then the browser's Back
        Then the developer does not land on the finished key form or the "Creating your key…" screen

      Scenario: DS-NAV-3 Leaving a half-filled form asks nothing
        When the developer types in the project form and goes back
        Then no "Discard changes?" window appears

      Scenario: DS-NAV-4 The Developer tab always leads home
        Given the developer is in any step
        When the developer clicks the "Developer Settings" tab
        Then the home page shows (or the welcome screen, if About you isn't saved yet)

      @he
      Scenario: DS-HE-1 Hebrew interface
        Given the interface language is Hebrew
        Then every Developer Settings string shows its Hebrew value, with no raw key names on the page
        And all text, including English project and key names, is right-aligned
        And back arrows point right
        And in lists of key names, the bullets sit on the right
        And in the "Signed in as" box, the email reads left to right with one parenthesis on each side of it

      # Added 2026-11-25 (sc-48553): the new-tab icon is mirrored in Hebrew, approved by Penina Levy
      @he @manual
      Scenario: DS-HE-2 The new-tab icon in Hebrew
        Given the interface language is Hebrew
        Then every open-in-new-tab icon in Developer Settings comes after its text in reading order, to its left
        And it points up and to the left

      @mobile
      Scenario: DS-PHONE-1 Phones
        Given a 375px-wide screen
        Then every tap target is at least 44 by 44 pixels, except links inside a sentence
        And each key is its own box, with Created above the Limit row
        And the header links move to a "Resources" list at the bottom [developer.home.resources.header]
        And no tooltips open; a disabled button's reason shows as text under it
        And confirm windows sit 16px from each edge, with full-width buttons stacked

      Scenario: DS-A11Y-1 Focus comes back to the button that opened a step
        Given a developer on the home page
        When the developer opens "Edit project details" on Verse a Day with the keyboard and goes back
        Then focus is on Verse a Day's "Edit project details" button
        When the developer creates a new key and returns home
        Then focus is on the new key's row

      Scenario: DS-A11Y-2 Windows read their text when they open
        When any confirm window opens (delete key, delete project, remove website, limit key)
        Then its title is its accessible name and its body text is its accessible description

      Scenario: DS-A11Y-3 The resend countdown is quiet
        When the visitor sends a confirmation link
        Then screen readers hear one announcement that the link was sent
        And the countdown is not in a live region, so it isn't read every second

      Scenario: DS-A11Y-4 Tooltips
        When the developer hovers or focuses the "Limit to website" (?) tip
        Then the tip opens, stays open while the pointer is on it, and its "Learn more" link can be clicked
        When the developer presses Escape
        Then the tip closes

      Scenario: DS-A11Y-5 Key buttons name their key
        Then each key's Show, Copy and Delete buttons are named for that key, e.g. "Copy key, Daily email"
