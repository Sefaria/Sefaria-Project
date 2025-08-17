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
- [ ] Header dropdowns - keyboard navigation
- [ ] Mobile menu - keyboard navigation

### General Interactive Elements
- [x] Quick feedback Like/Dislike buttons - need role/tabIndex/keys
- [ ] Compare Panel/Add Connection buttons - need keyboard access
- [ ] Modal close buttons - keyboard access
- [ ] Dropdown menu items (DropdownMenuItemWithCallback) - may need tabIndex

## Decisions Made
- **Button Strategy**: Created `Button` component with `variant="legacy"` that matches old `.button` CSS. Use for gradual migration from `div.button` → semantic `<button>` while keeping identical styling.
- **Focus Strategy**: Use browser defaults + custom outline for div[role="button"]
- **Dropdown Pattern**: Standardize on listbox with arrow navigation

## Big Decisions Needed
- **Systematic Migration Timeline**: When to migrate all div.button → Button component?
- **Focus Trap Strategy**: How to handle modal/overlay focus management consistently?

---
*Simplified tracking focused on actionable tasks*
