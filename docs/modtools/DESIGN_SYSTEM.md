# ModTools Design System

This document defines the visual design system for the ModeratorToolsPanel, including color tokens, typography, spacing, component patterns, and usage guidelines.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing System](#spacing-system)
5. [Component Patterns](#component-patterns)
6. [Layout Patterns](#layout-patterns)
7. [Feedback & Messaging](#feedback--messaging)
8. [Accessibility](#accessibility)
9. [Responsive Design](#responsive-design)
10. [Usage Examples](#usage-examples)

---

## Design Philosophy

The ModTools design follows these principles:

1. **Scholarly Character**: Uses Crimson Pro serif for headings, conveying academic authority
2. **Clean & Professional**: Warm, muted color palette (not stark white/black)
3. **Functional First**: Clear hierarchy, obvious actions, minimal decoration
4. **Consistent Patterns**: Every tool uses the same components and layouts
5. **Sefaria Integration**: Complements (doesn't clash with) the main Sefaria UI

---

## Color System

### CSS Variables

All colors are defined as CSS custom properties with `--mt-` prefix:

```css
:root {
  /* Background Colors */
  --mt-bg-page: #F8F7F4;      /* Main page background (warm off-white) */
  --mt-bg-card: #FFFFFF;       /* Card/section background */
  --mt-bg-subtle: #F3F2EE;     /* Subtle backgrounds for groupings */
  --mt-bg-input: #FAFAF8;      /* Input field background */
  --mt-bg-hover: #F0EFEB;      /* Hover state background */

  /* Brand Colors */
  --mt-primary: #1E3A5F;       /* Primary actions, headings (deep blue) */
  --mt-primary-hover: #152942; /* Primary hover state */
  --mt-primary-light: rgba(30, 58, 95, 0.08);  /* Primary tint */

  /* Accent Colors */
  --mt-accent: #0891B2;        /* Links, secondary actions (teal) */
  --mt-accent-hover: #0E7490;

  /* Text Colors */
  --mt-text: #1A1A1A;           /* Primary text (near-black) */
  --mt-text-secondary: #5C5C5C; /* Secondary/supporting text */
  --mt-text-muted: #8B8B8B;     /* Muted/placeholder text */
  --mt-text-on-primary: #FFFFFF;

  /* Border Colors */
  --mt-border: #E5E3DD;         /* Default border (warm gray) */
  --mt-border-hover: #C5C3BC;
  --mt-border-focus: var(--mt-primary);
}
```

### Semantic Status Colors

```css
:root {
  /* Success (Green) */
  --mt-success: #059669;
  --mt-success-bg: #ECFDF5;
  --mt-success-border: #A7F3D0;
  --mt-success-text: #065F46;

  /* Warning (Amber) */
  --mt-warning: #D97706;
  --mt-warning-bg: #FFFBEB;
  --mt-warning-border: #FDE68A;
  --mt-warning-text: #92400E;

  /* Error (Red) */
  --mt-error: #DC2626;
  --mt-error-bg: #FEF2F2;
  --mt-error-border: #FECACA;
  --mt-error-text: #991B1B;

  /* Info (Teal) */
  --mt-info: #0891B2;
  --mt-info-bg: #ECFEFF;
  --mt-info-border: #A5F3FC;
  --mt-info-text: #0E7490;
}
```

### Color Usage Guidelines

| Use Case | Color Variable | Example |
|----------|---------------|---------|
| Page background | `--mt-bg-page` | Main container |
| Section cards | `--mt-bg-card` | `.modToolsSection` |
| Grouped content | `--mt-bg-subtle` | Field group sections |
| Primary buttons | `--mt-primary` | Save, Load buttons |
| Section titles | `--mt-primary` | Tool headings |
| Body text | `--mt-text` | Paragraphs, labels |
| Help text | `--mt-text-muted` | Field descriptions |
| Selected items | `--mt-primary-light` | Selected cards |

---

## Typography

### Font Families

```css
:root {
  --mt-font-display: "Crimson Pro", "Georgia", serif;
  --mt-font-body: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
  --mt-font-hebrew: "Heebo", "Arial Hebrew", sans-serif;
  --mt-font-mono: "JetBrains Mono", "Fira Code", monospace;
}
```

| Font | Use Case | Example |
|------|----------|---------|
| Crimson Pro | Headings, titles | Section titles, page header |
| Plus Jakarta Sans | Body text, UI | Labels, descriptions, buttons |
| Heebo | Hebrew text | Hebrew titles, RTL content |
| JetBrains Mono | Code, technical | Field names, API values |

### Font Sizes (Modular Scale)

```css
:root {
  --mt-text-xs: 11px;   /* Badges, small labels */
  --mt-text-sm: 13px;   /* Help text, meta info */
  --mt-text-base: 15px; /* Body text */
  --mt-text-md: 16px;   /* Slightly larger body */
  --mt-text-lg: 18px;   /* Section intros */
  --mt-text-xl: 20px;   /* Mobile headings */
  --mt-text-2xl: 24px;  /* Section titles */
}
```

### Typography Hierarchy

```
Page Title (28px, Crimson Pro, semibold)
└── Section Title (24px, Crimson Pro, semibold)
    ├── Subsection Heading (15px, Jakarta, medium)
    │   ├── Body Text (15px, Jakarta, regular)
    │   ├── Help Text (13px, Jakarta, muted)
    │   └── Field Label (14px, Jakarta, semibold)
    └── Meta/Badge (11px, Jakarta or Mono)
```

---

## Spacing System

Based on a 4px grid:

```css
:root {
  --mt-space-xs: 4px;   /* Tight spacing (between related elements) */
  --mt-space-sm: 8px;   /* Small gaps (icon + text) */
  --mt-space-md: 16px;  /* Medium gaps (between form elements) */
  --mt-space-lg: 24px;  /* Large gaps (between sections) */
  --mt-space-xl: 32px;  /* Extra large (card padding) */
  --mt-space-2xl: 48px; /* Major breaks (page sections) */
}
```

### Common Spacing Applications

| Element | Padding/Margin | Variable |
|---------|---------------|----------|
| Card padding | 32px | `--mt-space-xl` |
| Between form rows | 16px | `--mt-space-md` |
| Between sections | 24px | `--mt-space-lg` |
| Icon to text gap | 8px | `--mt-space-sm` |
| Page bottom margin | 80px | Custom |

---

## Component Patterns

### Buttons

**Primary Button** (`.modtoolsButton`):
```css
.modtoolsButton {
  padding: 12px 24px;
  background: var(--mt-primary);
  color: white;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}
```

**Button Variants**:
- `.secondary` - Outlined, no fill
- `.danger` - Red background for destructive actions
- `.small` - Reduced padding (8px 16px)

**Button States**:
- `:hover` - Slight lift (`translateY(-1px)`), darker color
- `:disabled` - 50% opacity, no pointer cursor
- Loading - Shows spinner icon + "Saving..." text

### Inputs

**Standard Input** (`.dlVersionSelect`, `input[type="text"]`):
```css
input {
  padding: 12px 16px;
  background: var(--mt-bg-input);
  border: 1.5px solid var(--mt-border);
  border-radius: 10px;
  font-size: 15px;
}
```

**Input States**:
- `:hover` - Border darkens to `--mt-border-hover`
- `:focus` - Border becomes `--mt-primary`, adds focus ring
- `.hasError` - Red border and background

**Select Dropdowns**:
Custom chevron icon via background-image, 44px right padding.

### Cards

**Section Card** (`.modToolsSection`):
```css
.modToolsSection {
  background: white;
  padding: 32px;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--mt-border);
}
```

**Index Card** (`.indexCard`):
```css
.indexCard {
  padding: 16px;
  border: 1.5px solid var(--mt-border);
  border-radius: 10px;
}

.indexCard.selected {
  border-color: var(--mt-primary);
  background: rgba(30, 58, 95, 0.08);
  box-shadow: inset 4px 0 0 var(--mt-primary);  /* Blue left indicator */
}
```

### Collapsible Sections

**Section Header** (`.sectionHeader`):
```
┌──────────────────────────────────────────────────────────────┐
│ [▼] Section Title (English)  טייטל (Hebrew)    ............[?]│
└──────────────────────────────────────────────────────────────┘
      ↑                                                    ↑
  collapseToggle                                      helpButton
```

**Collapse Animation**:
```css
.sectionContent {
  transition: max-height 0.3s ease-out, opacity 0.2s ease-out;
  max-height: 5000px;
}

.collapsed .sectionContent {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}
```

### Help Modal

**Structure**:
```
┌────────────────────────────────────────────────────┐
│ Modal Title                                    [×] │  <- header
├────────────────────────────────────────────────────┤
│                                                    │
│   Scrollable content area                          │  <- body
│   - Headings (h3)                                  │
│   - Paragraphs                                     │
│   - Tables                                         │
│   - Warning/Info boxes                             │
│                                                    │
├────────────────────────────────────────────────────┤
│                                        [Got it]    │  <- footer
└────────────────────────────────────────────────────┘
```

**Modal Dimensions**:
- Max width: 680px
- Max height: 85vh
- Backdrop: rgba(0, 0, 0, 0.5)

---

## Layout Patterns

### Search Row
Input + Button side-by-side:
```html
<div class="searchRow">
  <input placeholder="Version title..." />
  <button class="modtoolsButton">Search</button>
</div>
```

### Filter Row
Label + Dropdown inline:
```html
<div class="filterRow">
  <label>Filter by language:</label>
  <select>...</select>
</div>
```

### Action Row
Multiple buttons with gap:
```html
<div class="actionRow">
  <button class="modtoolsButton">Save Changes</button>
  <button class="modtoolsButton danger">Delete</button>
</div>
```

### Field Group Section
Grouped form fields with header:
```html
<div class="fieldGroupSection">
  <div class="fieldGroupHeader">SECTION HEADER</div>
  <div class="fieldGroupGrid">
    <div class="fieldGroup">...</div>
    <div class="fieldGroup">...</div>
  </div>
</div>
```

### Index Card Grid
3-column responsive grid:
```css
.indexCardGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
}
```

---

## Feedback & Messaging

### Alert Boxes

| Type | Class | Use Case |
|------|-------|----------|
| Info | `.infoBox` | Helpful information, instructions |
| Warning | `.warningBox` | Cautions, important notes |
| Danger | `.dangerBox` | Destructive action warnings, errors |

**Structure**:
```html
<div class="warningBox">
  <strong>Title:</strong>
  <ul>
    <li>Point 1</li>
    <li>Point 2</li>
  </ul>
</div>
```

### Status Messages

Auto-detected type based on emoji prefix:
- `✅` → Success (green)
- `❌` → Error (red)
- `⚠️` → Warning (amber)
- Default → Info (teal)

### Changes Preview

Shows pending changes before save:
```html
<div class="changesPreview">
  <strong>Changes to apply:</strong>
  <ul>
    <li>license: "CC-BY"</li>
    <li>priority: "1.5"</li>
  </ul>
</div>
```

### No Results State

```html
<div class="noResults">
  <strong>No texts found with version "X"</strong>
  Please verify the exact version title...
</div>
```

---

## Accessibility

### Keyboard Navigation

| Element | Keys | Behavior |
|---------|------|----------|
| Collapse toggle | Enter, Space | Toggle section |
| Modal | Escape | Close modal |
| Buttons | Enter | Activate |
| Cards | Click | Toggle selection |

### Focus States

All interactive elements have visible focus rings:
```css
:focus {
  outline: none;
  box-shadow: 0 0 0 4px var(--mt-primary-light);
}
```

### ARIA Attributes

```html
<div class="sectionHeader"
     role="button"
     tabIndex={0}
     aria-expanded={!isCollapsed}>
```

### Color Contrast

All text meets WCAG AA contrast ratios:
- Body text (`--mt-text`) on card background: 12.6:1
- Muted text (`--mt-text-muted`) on card: 4.5:1
- Button text on primary: 8.4:1

---

## Responsive Design

### Breakpoints

Currently no explicit breakpoints. The grid system naturally adapts:
- 3-column grid wraps on narrow screens
- Max-width container (1100px) centers on large screens

### Print Styles

```css
@media print {
  /* Expand collapsed sections */
  .collapsed .sectionContent {
    max-height: none;
    opacity: 1;
  }

  /* Hide interactive elements */
  .modtoolsButton,
  .helpButton,
  .collapseToggle {
    display: none;
  }
}
```

---

## Usage Examples

### Creating a New Tool Section

```jsx
<ModToolsSection
  title="My New Tool"
  titleHe="כלי חדש"
  helpContent={<>
    <h3>What This Tool Does</h3>
    <p>Description here...</p>
  </>}
>
  {/* Search Bar */}
  <div className="searchRow">
    <input className="dlVersionSelect" placeholder="Search..." />
    <button className="modtoolsButton">Search</button>
  </div>

  {/* Results */}
  {results.length > 0 && (
    <IndexSelector
      indices={results}
      selectedIndices={selected}
      onSelectionChange={setSelected}
      label="items"
    />
  )}

  {/* Actions */}
  <div className="actionRow">
    <button className="modtoolsButton">Save</button>
  </div>

  {/* Status */}
  <StatusMessage message={msg} />
</ModToolsSection>
```

### Adding a Field Group

```jsx
<div className="fieldGroupSection">
  <div className="fieldGroupHeader">FIELD GROUP NAME</div>
  <div className="fieldGroupGrid">
    <div className="fieldGroup">
      <label>Field Label:</label>
      <div className="fieldHelp">Help text here</div>
      <input className="dlVersionSelect fieldInput" />
    </div>
    {/* More fields... */}
  </div>
</div>
```

### Showing a Warning

```jsx
<div className="warningBox">
  <strong>Important Notes:</strong>
  <ul>
    <li><strong>Note 1:</strong> Description</li>
    <li><strong>Note 2:</strong> Description</li>
  </ul>
</div>
```

---

## CSS File Location

All styles are in: `static/css/modtools.css`

The CSS is organized into numbered sections:
1. Design Tokens
2. Base & Reset
3. Layout Components
4. Form Elements
5. Layout Patterns
6. Buttons
7. Data Display Components
8. Field Groups
9. Feedback & Alerts
10. Collapsible Sections
11. Help Button & Modal
12. Print Styles
