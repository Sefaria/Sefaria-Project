# ModTools Rebuild Progress Tracker

This file tracks progress on the ModeratorToolsPanel rebuild for Shortcut #36475.

## Completed Work

### Phase 1: Documentation & Analysis
- [x] Created `AI_AGENT_GUIDE.md` with file locations, API endpoints, data models
- [x] Created `ARCHITECTURE.md` documenting component structure
- [x] Documented known bugs and gotchas

### Phase 2: Critical Bug Fixes
- [x] Fixed PyMongo deprecated `update()` method in `history.py:210`
  - Changed `db.history.update(...)` to `db.history.update_many(...)`
- [x] Added partial success handling in `version_bulk_edit_api`
  - Returns `{status: "ok"|"partial"|"error", count, total, successes, failures}`
- [x] Documented status field behavior (status="locked" prevents non-staff edits)

### Phase 3: Architecture Refactor
- [x] Created `/static/js/modtools/` directory structure
- [x] Created `/static/css/modtools.css` with Sefaria design system
- [x] Split components into separate files:
  - `components/BulkVersionEditor.jsx`
  - `components/BulkIndexEditor.jsx`
  - `components/AutoLinkCommentaryTool.jsx`
  - `components/NodeTitleEditor.jsx`
- [x] Created shared components:
  - `components/shared/ModToolsSection.jsx`
  - `components/shared/StatusMessage.jsx`
  - `components/shared/IndexSelector.jsx`
- [x] Created `constants/fieldMetadata.js` with VERSION_FIELD_METADATA, INDEX_FIELD_METADATA
- [x] Updated `ModeratorToolsPanel.jsx` to import refactored components

### Phase 4: Shortcut #36475 Requirements
- [x] Enhanced IndexSelector with Select All / Deselect All buttons
- [x] Added selection count display ("X of Y texts selected")
- [x] Added field grouping (Identification, Source & License, Metadata, Notes)
- [x] Added URL validation for versionSource, purchaseInformationURL, purchaseInformationImage
- [x] Added Clear button for search reset
- [x] Added no-results message with helpful guidance
- [x] Added bulk delete (soft delete) with confirmation dialog
  - Marks versions with `[MARKED FOR DELETION - date]` in versionNotes

### Phase 5: Visual Design & UX
- [x] Created dedicated CSS file with Sefaria design system variables
- [x] Added "Internal Admin Tool" banner
- [x] Button variants (primary, secondary, danger, small)
- [x] Field group sections with headers
- [x] Responsive layout for mobile
- [x] Selected item highlighting in index list

### Phase 6: Documentation
- [x] Updated AI_AGENT_GUIDE.md with new file locations
- [x] Updated decisions log
- [x] Updated CSS class reference

## Completed Commits

All commits completed and pushed:
1. [x] Backend fixes (history.py, views.py, helper/text.py) - `7ab3e635b`
2. [x] CSS file (modtools.css) - `ba76c7d4c`
3. [x] Shared components (modtools/components/shared/*) - `badd54538`
4. [x] Constants (modtools/constants/*) - `ecc4707ad`
5. [x] Individual tool components (BulkVersionEditor, etc.) - `6bb35339f`
6. [x] Module entry point (modtools/index.js) + Main panel - `ac0453789`
7. [x] Documentation (docs/modtools/*) - `e5f476088`
8. [x] API tests and error handling - `92fdbae34`
9. [x] Card-based UI redesign with category metadata - `8f0c5313b`

### PR Status
- [x] PR #2527 updated with comprehensive description
- [x] Test plan checklist included
- [ ] Ready for review (PR is still draft)

## Questions for Later

1. **Timeout handling**: Large bulk operations (50+ versions) may still timeout. Consider:
   - Batch processing with progress indicator
   - Async job queue
   - WebSocket for real-time updates

2. **Hard delete**: Currently only soft delete is implemented. Should we add actual deletion capability for admins?

3. **Version history**: The versionNotes field is overwritten by soft delete. Should we append instead?

## Strategies & Notes

### CSS Import Strategy
- CSS is imported directly in `ModeratorToolsPanel.jsx` via webpack
- Alternative: Add to Django template (base.html) but would load for all pages

### Soft Delete Implementation
- Uses versionNotes field with `[MARKED FOR DELETION - date]` prefix
- Can be searched via MongoDB: `{versionNotes: {$regex: "MARKED FOR DELETION"}}`
- Doesn't require backend changes

### Field Grouping
Groups in BulkVersionEditor:
1. Version Identification (versionTitle, versionTitleInHebrew)
2. Source & License (versionSource, license, purchaseInformationURL, purchaseInformationImage)
3. Metadata (status, priority, digitizedBySefaria, isPrimary, isSource, direction)
4. Notes (versionNotes, versionNotesInHebrew)

## File Changes Summary

### New Files
- `static/css/modtools.css`
- `static/js/modtools/index.js`
- `static/js/modtools/constants/fieldMetadata.js`
- `static/js/modtools/components/BulkVersionEditor.jsx`
- `static/js/modtools/components/BulkIndexEditor.jsx`
- `static/js/modtools/components/AutoLinkCommentaryTool.jsx`
- `static/js/modtools/components/NodeTitleEditor.jsx`
- `static/js/modtools/components/shared/ModToolsSection.jsx`
- `static/js/modtools/components/shared/StatusMessage.jsx`
- `static/js/modtools/components/shared/IndexSelector.jsx`
- `static/js/modtools/components/shared/index.js`
- `docs/modtools/AI_AGENT_GUIDE.md`
- `docs/modtools/ARCHITECTURE.md`
- `docs/modtools/PROGRESS.md`

### Modified Files
- `sefaria/model/history.py` - PyMongo fix
- `sefaria/views.py` - Partial success handling
- `sefaria/helper/text.py` - Minor updates
- `static/js/ModeratorToolsPanel.jsx` - Import refactored components
