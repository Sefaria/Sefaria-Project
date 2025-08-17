# Accessibility Issues - WCAG 2.2 Level A

## By Page/Component

### Sidepanel - Tools & Resources  
- [x] Edit note pencil - not reachable with tab
- [ ] Edit note pencil visibility - only tabbable after mouse hover makes it visible
- [x] Make Add to Sheets dropdown selection match Feedback dropdown behavior

### Sheets
- [ ] + button to add new block section - not reachable with tab
- [ ] Topic textarea in publish modal - can't exit with tab/escape
- [ ] ... menu dropdown - can't navigate into opened menu with tab
- [x] Button focus styling not working for sheets buttons

### Search & Filters
- [ ] Filter checkboxes - verify keyboard accessibility
- [ ] Search autocomplete - keyboard navigation

### Collections
- [x] Close "×" button in widget header - needs keyboard access

### Headers & Navigation  
- [x] Header buttons - space key activation (fixed SignUpButton, HelpButton, ModuleSwitcher, CreateButton)
- [x] Main navigation links - space key activation (fixed Texts, Topics, Donate links)
- [x] Header icons - space key activation (fixed librarySavedIcon, sheetsNotificationsIcon)
- [x] Header dropdowns - keyboard navigation (fixed ModuleSwitcher double tab, dropdown menu items space key)
- [x] Focus outline behavior - fixed mouse clicks showing outline (consistent user-is-tabbing system)
- [ ] Mobile menu - keyboard navigation
- [ ] Versions tab not reachable with keyboard navigation on book page
- [x] Navigation tabs - space key activation (fixed navTitleTab in UserHistoryPanel, LanguageToggleButton)

### General Interactive Elements
- [x] Quick feedback Like/Dislike buttons - need role/tabIndex/keys
- [ ] Compare Panel/Add Connection buttons - need keyboard access
- [ ] Modal close buttons - keyboard access
- [x] Dropdown menu items - space key activation (fixed DropdownMenuItem, DropdownMenuItemLink, DropdownMenuItemWithCallback)
- [x] Space key activation - buttons now respond to both Enter and Space keys

### Button Migration to New Component System
- [x] Priority 1 Files - Misc.jsx and Header.jsx migrated to new Button component
- [x] SmallBlueButton component - converted to use Button component
- [x] LoginPrompt buttons - updated to new button styling
- [x] Modal action buttons - migrated to Button component (Cancel/Save)
- [x] Feedback buttons - migrated to Button component (Like/Dislike)
- [x] Cookie notification - converted spans to proper Button elements
- [x] Banner buttons - updated to new button styling
- [x] Priority 2 Files - Major button pattern files migrated (20 instances total)
  - [x] NavSidebar.jsx - 10 button instances (navigation, social, download)
  - [x] MyNotesPanel.jsx - 2 button instances (Add to Sheet buttons)
  - [x] UserProfile.jsx - 4 button instances (feedback and navigation)
  - [x] EditCollectionPage.jsx - 4 button instances (save, cancel, upload)
- [x] Priority 3 Files - SearchFilters.jsx (2 instances) + Misc.jsx cleanup (3 instances)
- [ ] Template files - HTML templates with .button classes

## Standards
- **Button Strategy**: Use semantic `<button>` elements for actions, `<a>` for navigation
- **Focus Strategy**: Browser defaults + consistent outline styling  
- **Dropdown Pattern**: Established - all dropdown menu items respond to Enter and Space keys

## Manual Testing Required
*Remove items from this list after testing them manually*

### Focus Behavior Testing
- [ ] **Focus outline behavior** - Tab through buttons (should show blue outline) vs. mouse clicks (no outline)
- [ ] **Focus sequence** - Tab navigation follows logical order through interface elements

### Button Functionality Testing
**Priority 1 Files (Misc.jsx + Header.jsx):**
- [ ] **SmallBlueButton component** - test all instances work as before
- [ ] **Login/Register buttons** - test navigation and styling in LoginPrompt  
- [ ] **Modal action buttons** - test Cancel/Save in AdminToolHeader
- [ ] **Feedback buttons** - test Like/Dislike in ReaderMessage
- [ ] **Cookie notification buttons** - test OK button (EN/HE)
- [ ] **Banner buttons** - test banner link buttons (EN/HE)
- [ ] **Modal buttons** - test modal navigation buttons (EN/HE)
- [ ] **Feedback submit button** - test feedback form submission
- [ ] **Header signup button** - test signup navigation

**Priority 2 Files:**
- [ ] **NavSidebar buttons** - test all 10 instances:
  - [ ] Study Companion signup button
  - [ ] Getting Started video buttons (EN/HE)
  - [ ] Community explore button
  - [ ] Social media buttons (Facebook, Instagram, YouTube)
  - [ ] Collection creation button
  - [ ] Collection exploration button
  - [ ] Download version button
- [ ] **MyNotesPanel buttons** - test Add to Sheet buttons (EN/HE)
- [ ] **UserProfile buttons** - test all 4 instances:
  - [ ] Submit Feedback button
  - [ ] Back to Profile buttons (enable/disable editor)
  - [ ] Feedback toggle white button
- [ ] **EditCollectionPage buttons** - test all 4 instances:
  - [ ] Cancel button (navigation)
  - [ ] Save collection button
  - [ ] Upload collection image button
  - [ ] Upload header image button

**Priority 3 Files:**
- [ ] **SearchFilters buttons** - test both instances:
  - [ ] Mobile "Show Results" button
  - [ ] Clear input button (X icon)

### Accessibility Testing
- [ ] **Screen reader compatibility** - buttons properly announced with correct roles
- [ ] **Keyboard navigation** - all buttons accessible via Tab key
- [ ] **Button activation** - Enter and Space keys trigger button actions
- [ ] **ARIA labels** - icon-only buttons have proper accessible labels
- [ ] **Focus management** - focus moves logically through interface

### Visual Consistency Testing
- [ ] **Button styling** - all migrated buttons have consistent appearance
- [ ] **Hover states** - buttons respond to mouse hover appropriately
- [ ] **Active states** - buttons show appropriate feedback when clicked
- [ ] **Disabled states** - disabled buttons display correctly

## Newly Discovered Issues (From Manual Testing)

### Space Key Activation Issues
- [x] **Card titles** - `<a href="/sheets/topics/parashat-reeh" class="cardTitle">` not clickable with space key - FIXED
- [x] **Footer container** - content on `/sheets` page not clickable with space key - FIXED

### Keyboard Navigation Issues  
- [x] **texts-properties-menu** - arrow key and tab navigation not working properly - FIXED
  - Added Escape key handling, focus trapping, and auto-focus on open
  - Proper dialog role with aria-label and keyboard navigation
  - Tab cycles between first/last elements with focus management
- [x] **readerOptions button** - has duplicate tab targets (can tab to two things) - FIXED
  - Fixed DisplaySettingsButton by adding tabIndex="-1" to inner span  
  - Only ToolTipped wrapper is focusable, eliminates duplicate tab targets
- [x] **Add topics text field** - in Publish popup, can't tab out once typing starts - FIXED
  - Removed "Tab" from ReactTags delimiters array in PublishMenu.jsx, categorize_sheets.jsx, and Misc.jsx
  - Tab now functions normally for keyboard navigation instead of creating tags
  - Users can still create tags using Enter and comma delimiters

### Additional Navigation Issues (December 2024)
- [x] **readerOptions triple tab stop** - requires 3 tab presses to pass button - FIXED
  - Removed duplicate tabIndex from DropdownMenu wrapper div in DropdownMenu.jsx
  - Only the inner ToolTipped button is now focusable (single tab stop)
  - Moved keyboard handling to cloned buttonComponent instead of wrapper
- [x] **readerOptions arrow key navigation** - arrow keys close menu immediately - FIXED
  - Added proper arrow key handling in RadioButton component
  - Arrow keys now navigate between radio options without closing menu
  - Used e.stopPropagation() to prevent event bubbling to menu handlers
  - Enhanced ReaderDisplayOptionsMenu with arrow key protection

### Focus Outline Issues
- [x] **dropdownLinks-menu items** - first and last items have incomplete blue borders - FIXED
  - Added proper focus styling for interfaceLinks-option and dropdownItem elements
  - Consistent blue outline appears only during keyboard navigation
  - Uses established user-is-tabbing system for keyboard vs mouse interaction

## Remaining Work
- Upload Image buttons - special handling needed (labels for file inputs)
- Complex editor interface buttons - evaluate on case-by-case basis
- Focus trap management for modals/overlays
- Mobile menu keyboard navigation
- Compare Panel/Add Connection buttons
- Modal close buttons

---
*Simplified tracking focused on actionable tasks*
