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
- [ ] Priority 3 Files - Remaining files with button patterns (SearchFilters.jsx, etc.)
- [ ] Template files - HTML templates with .button classes

## Standards
- **Button Strategy**: Use semantic `<button>` elements for actions, `<a>` for navigation
- **Focus Strategy**: Browser defaults + consistent outline styling  
- **Dropdown Pattern**: Established - all dropdown menu items respond to Enter and Space keys

## Remaining Work
- Upload Image buttons - special handling needed (labels for file inputs)
- Complex editor interface buttons - evaluate on case-by-case basis
- Focus trap management for modals/overlays
- Mobile menu keyboard navigation
- Compare Panel/Add Connection buttons
- Modal close buttons

---
*Simplified tracking focused on actionable tasks*
