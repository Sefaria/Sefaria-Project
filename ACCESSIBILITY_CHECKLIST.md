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
- [ ] Versions tab not reachable with keyboard navigation on book page

### General Interactive Elements
- [x] Quick feedback Like/Dislike buttons - need role/tabIndex/keys
- [ ] Compare Panel/Add Connection buttons - need keyboard access
- [ ] Modal close buttons - keyboard access
- [ ] Dropdown menu items (DropdownMenuItemWithCallback) - may need tabIndex
- [x] Space key activation - buttons now respond to both Enter and Space keys

## Standards
- **Button Strategy**: Use semantic `<button>` elements for actions, `<a>` for navigation
- **Focus Strategy**: Browser defaults + consistent outline styling  
- **Dropdown Pattern**: Listbox with arrow navigation

## Remaining Work
- Upload Image buttons - special handling needed (labels for file inputs)
- Complex editor interface buttons - evaluate on case-by-case basis
- Focus trap management for modals/overlays

---
*Simplified tracking focused on actionable tasks*
