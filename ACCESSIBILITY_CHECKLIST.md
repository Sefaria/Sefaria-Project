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
- [x] Space key activation - buttons now respond to both Enter and Space keys

## Decisions Made
- **Button Strategy**: ✅ **UPDATED** - Migrate all interactive buttons to semantic `<button>` elements for native accessibility. Legacy `.button` CSS works with both `<a>` and `<button>`.
- **Focus Strategy**: Use browser defaults + custom outline. Semantic buttons handle space/enter keys automatically.
- **Dropdown Pattern**: Standardize on listbox with arrow navigation
- **Migration Progress**: 
  - ✅ Save/Share buttons → semantic `<button>` 
  - ✅ Source/Connection/Text/Media/Comment → semantic `<button>`
  - ✅ Add Source/Browse Sources → semantic `<button>`
  - ✅ Add to Sheet buttons (connections, media, comments, custom text) → semantic `<button>`
  - ✅ Daf Yomi page → all 3 buttons now proper `<a>` (were div wrapping a)
  - ✅ Edit Profile Save button → semantic `<button>`
  - ✅ "View in Library" remains `<a>` (navigation link)
  - ⚠️ Upload Image button → needs special handling (label for file input)
  - 🔍 React component buttons → many found, need evaluation

## Big Decisions Needed
- **Systematic Migration Timeline**: When to migrate all div.button → Button component?
- **Focus Trap Strategy**: How to handle modal/overlay focus management consistently?

---
*Simplified tracking focused on actionable tasks*
