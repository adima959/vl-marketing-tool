# Design Patterns Reference

Dense reference for UI components, layouts, and visual patterns.

## Table of Contents

1. [GenericDataTable](#genericdatatable) - Deep dive into table component
2. [Table Patterns](#table-patterns) - Visual specs, headers, hierarchy
3. [Filter Components](#filter-components) - Toolbar, pickers, pills
4. [Component Library Split](#component-library-split) - When to use Ant vs shadcn/ui
5. [Layout Patterns](#layout-patterns) - Cards, modals, page structure
6. [Visual Specifications](#visual-specifications) - Colors, spacing, typography

---

## GenericDataTable

**File**: `components/table/GenericDataTable.tsx`
**Purpose**: Type-safe hierarchical table with expand/collapse, column groups, loading states

### Type Signature

```typescript
import type { GenericDataTableConfig } from '@/types/table';

export function GenericDataTable<TRow extends BaseTableRow>(
  config: GenericDataTableConfig<TRow>
): JSX.Element

// Config interface
interface GenericDataTableConfig<TRow extends BaseTableRow> {
  useStore: () => TableStore<TRow>;
  useColumnStore: () => ColumnStore;
  metricColumns: MetricColumn[];
  columnGroups: ColumnGroup[];
  colorClassName: string;
  showColumnTooltips?: boolean;
}
```

### Required Interfaces

**TRow must extend BaseTableRow**:
```typescript
interface BaseTableRow {
  key: string;          // Unique identifier (hierarchical format: "dim::val::dim::val")
  attribute: string;    // Display text for Attributes column
  depth: number;        // Hierarchy level (0 = root, 1 = first child, etc.)
  hasChildren?: boolean; // Can this row expand?
  children?: BaseTableRow[]; // Lazy-loaded child rows
  metrics: Record<string, number>; // Metric values
}
```

**Store interfaces**:
```typescript
interface TableStore<TRow extends BaseTableRow> {
  reportData: TRow[];
  loadedDimensions: string[];
  expandedRowKeys: string[];
  setExpandedRowKeys: (keys: string[]) => void;
  sortColumn: string | null;
  sortDirection: 'ascend' | 'descend' | null;
  setSort: (column: string | null, direction: 'ascend' | 'descend' | null) => Promise<void>;
  isLoading: boolean;
  hasLoadedOnce: boolean;
  loadChildData: (key: string, value: string, depth: number) => Promise<void>;
  loadData: () => Promise<void>;
  error: string | null;
}

interface ColumnStore {
  visibleColumns: string[];
}
```

### Props Deep Dive

#### 1. `useStore` (required)

**Type**: `() => TableStore<TRow>`
**Purpose**: Hook to access data and actions

```typescript
// Example
import { useReportStore } from '@/stores/reportStore';

<GenericDataTable
  useStore={useReportStore}
  // ... other props
/>
```

**What it provides**:
- `reportData`: Array of rows to display
- `expandedRowKeys`: Keys of expanded rows
- `setExpandedRowKeys`: Update expansion state
- `loadChildData`: Load children for a row
- `isLoading`, `error`: Loading and error states

---

#### 2. `useColumnStore` (required)

**Type**: `() => ColumnStore`
**Purpose**: Hook to access column visibility

```typescript
// Example
import { useColumnStore } from '@/stores/columnStore';

<GenericDataTable
  useColumnStore={useColumnStore}
  // ... other props
/>
```

**What it provides**:
- `visibleColumns`: Array of metric IDs currently visible

---

#### 3. `metricColumns` (required)

**Type**: `MetricColumn[]`
**Purpose**: Define all available metric columns

```typescript
// types/metrics.ts
interface MetricColumn {
  id: string;               // Unique ID (must match key in row.metrics)
  label: string;            // Full column header text
  shortLabel: string;       // Abbreviated text (for narrow columns)
  description?: string;     // Tooltip text
  format: MetricFormat;     // 'number' | 'percentage' | 'currency' | 'decimal' | 'time'
  category: string;         // Grouping category
  defaultVisible: boolean;  // Show by default?
  width: number;            // Column width in pixels
  align: 'left' | 'center' | 'right'; // Text alignment
}

// Example
const METRIC_COLUMNS: MetricColumn[] = [
  {
    id: 'clicks',
    label: 'Clicks',
    shortLabel: 'Clicks',
    description: 'Total number of clicks',
    format: 'number',
    category: 'basic',
    defaultVisible: true,
    width: 120,
    align: 'right',
  },
  {
    id: 'ctr',
    label: 'Click-Through Rate',
    shortLabel: 'CTR',
    description: 'Percentage of impressions that resulted in clicks',
    format: 'percentage',
    category: 'calculated',
    defaultVisible: true,
    width: 100,
    align: 'right',
  },
];
```

---

#### 4. `columnGroups` (required)

**Type**: `ColumnGroup[]`
**Purpose**: Group columns under shared headers (creates two-row header)

```typescript
interface ColumnGroup {
  title: string;      // Group header text
  metricIds: string[]; // Metric IDs in this group
}

// Example
const COLUMN_GROUPS: ColumnGroup[] = [
  {
    title: 'Marketing Data',
    metricIds: ['clicks', 'impressions', 'ctr', 'cost'],
  },
  {
    title: 'CRM Data',
    metricIds: ['conversions', 'revenue', 'roas'],
  },
];
```

**Result**: Two-row table header
```
| Attributes | Marketing Data                           | CRM Data                  |
|            | Clicks | Impressions | CTR | Cost | Conversions | Revenue | ROAS |
```

---

#### 5. `colorClassName` (required)

**Type**: `string`
**Purpose**: CSS Module class for color theming

```typescript
// DataTable.module.css
.marketingColors {
  --group-color-0: #e6f7ed; /* First group color */
  --group-color-1: #f0f9ff; /* Second group color */
}

// Usage
import styles from './DataTable.module.css';

<GenericDataTable
  colorClassName={styles.marketingColors}
  // ... other props
/>
```

**Applied to**: Column group headers, expanded row backgrounds

---

#### 6. `showColumnTooltips` (optional)

**Type**: `boolean` (default: `false`)
**Purpose**: Show info icon + tooltip on column headers

```typescript
// Enable tooltips (uses MetricColumn.description)
<GenericDataTable
  showColumnTooltips={true}
  // ... other props
/>
```

**When to use**:
- Complex metrics needing explanation
- Calculated fields with formulas
- Acronyms or abbreviations

---

### Behavior

#### Expansion / Collapse

1. **Click expand icon (▶)**: Loads child data, expands row
2. **Click collapse icon (▼)**: Collapses row (data remains loaded)
3. **Row styling**:
   - Expanded: Background changes to `--group-color-N` based on depth
   - Hover: `#f0f9ff` background
4. **Indent**: 20px per depth level

#### Drag Scrolling

- **Mouse down + drag**: Horizontal scroll (for wide tables)
- **Cursor**: Changes to grab/grabbing during drag

#### Data Loading Behavior

**Initial load:**
- Calls `loadData()` from store
- **Replaces** all existing data (clears previous state)
- Loads only top-level rows (depth = 0)
- Sets `hasLoadedOnce = true`

**Lazy load children:**
- User clicks expand icon (▶)
- Calls `loadChildData(key, value, depth)` from store
- **Behavior:** Appends children to parent row (does NOT replace if called twice)
- **Idempotency:** NOT idempotent - calling twice loads duplicates (store should prevent)
- **Cache responsibility:** Store must track which rows have children loaded
- **Example:** Expanding "Campaign A" calls `loadChildData("campaign::Campaign A", "Campaign A", 1)`

**Collapse behavior:**
- Clicking collapse icon (▼) does NOT remove children from data
- Only hides them visually via `expandedRowKeys` state
- Children remain in memory for instant re-expansion

#### Loading States

- **Initial load** (`!hasLoadedOnce`): Shows full-page spinner
- **Child loading** (`isLoading`): Shows spinner on specific row
- **Empty state**: Shows EmptyState component if no data

#### Error Handling

- **Error**: Shows error message above table
- **Retry**: User can change filters and click "Load Data"

---

## Table Patterns

### Two-Row Header Structure

```
┌────────────┬──────────────────────────────┬─────────────────────┐
│ Attributes │    Group 1 Header            │  Group 2 Header     │
├────────────┼──────────┬──────────┬────────┼──────────┬──────────┤
│            │ Metric A │ Metric B │ Metric C│ Metric D │ Metric E │
├────────────┼──────────┼──────────┼────────┼──────────┼──────────┤
│ ▶ Row 1    │  1,234   │   56.7%  │  $890  │   123    │   $456   │
│   ▶ Row 1.1│    234   │   12.3%  │  $234  │    23    │    $89   │
└────────────┴──────────┴──────────┴────────┴──────────┴──────────┘
```

**Header Structure Rules:**

**Row 1 - Column Groups (optional):**
- Groups metrics into categories (e.g., "Performance", "Attribution", "Quality")
- Only spans columns within that group (no cross-group spanning)
- If metric has no group: Show empty cell OR group title "Other"
- Group defined in `COLUMN_GROUPS` config array

**Row 2 - Column Labels (required):**
- Individual metric labels (e.g., "Clicks", "CTR", "Conversions")
- Always appears, even if no groups in Row 1
- Defined in `METRIC_COLUMNS` config array

**Valid configurations:**
```typescript
// With groups (two-row header)
COLUMN_GROUPS = [
  { title: 'Performance', metricIds: ['clicks', 'impressions'] }
]

// Without groups (single-row header, but still shows Row 2)
COLUMN_GROUPS = []  // Row 1 empty, Row 2 shows metric labels
```

---

### Attributes Column (Fixed Left)

**Width**: 300px (fixed)
**Content**: Hierarchy with icons + text

```typescript
// Rendering logic
function renderAttribute(row: BaseTableRow) {
  return (
    <div style={{ paddingLeft: `${row.depth * 20}px` }}>
      {row.hasChildren && (
        <button onClick={() => handleExpand(row.key)}>
          {isExpanded ? '▼' : '▶'}
        </button>
      )}
      <span>{row.attribute}</span>
    </div>
  );
}
```

**Styling**:
- Indent: 20px per depth level
- Icon: 16x16px, 4px margin-right
- Text: 14px, `--color-text-primary`
- Hover: pointer cursor on expandable rows

### Metric Columns

**Number formatting**:
```typescript
import { formatMetric } from '@/lib/formatters';

function renderMetric(value: number, format: MetricFormat) {
  return formatMetric(value, format);
}

// Examples:
// number:     1234 → "1,234"
// percentage: 0.567 → "56.7%"
// currency:   1234.56 → "$1,234.56"
// decimal:    1.23456 → "1.23"
// time:       125 → "2:05"
```

**Typography**:
- Font: 14px
- Font feature: `tabular-nums` (NOT monospace)
- Alignment: Right-aligned
- Color: `--color-text-primary`

### Row States & Interactive Cursor Specifications

**Row States:**

| State | Background | Border | Cursor |
|-------|------------|--------|--------|
| Default | `#ffffff` | None | default |
| Hover row | `#f0f9ff` | None | pointer (entire row clickable) |
| Expanded row | `var(--group-color-N)` | None | default |
| Loading | `#ffffff` | None | wait |

**Interactive Element Cursors:**

| Element | Cursor | Hover Behavior | Notes |
|---------|--------|----------------|-------|
| Expand/collapse icon (▶/▼) | pointer | scale `1.1` | Interactive button |
| Metric cells | default | none | Not clickable (unless drilldown enabled) |
| Draggable dimension pills | grab | active: `grabbing` | FilterToolbar pills |
| Column headers (sortable) | pointer | underline | Shows sort indicator |
| Column headers (non-sortable) | default | none | Static label |
| "Load Data" button | pointer | brightness `0.95` | Primary action |

### Sort Indicators

- **Ascending**: ▲ icon next to column header
- **Descending**: ▼ icon next to column header
- **No sort**: No icon
- **Click header**: Toggles sort direction

---

## Filter Components

### FilterToolbar

**File**: `components/filters/FilterToolbar.tsx`
**Layout**: Left-aligned pills + right-aligned date picker + button

```
┌────────────────────────────────────────────────────────────────┐
│  [Campaign ×] [Ad Group ×] [Keyword ×]    [Date Range] [Load Data] │
└────────────────────────────────────────────────────────────────┘
```

**Spacing**: 12px gaps between all elements

**Template**:
```typescript
<div className="filter-toolbar">
  <div className="left-section">
    <DimensionPills dimensions={dimensions} onRemove={removeDimension} />
    <DimensionPicker onAdd={addDimension} />
  </div>
  <div className="right-section">
    <DateRangePicker value={dateRange} onChange={setDateRange} />
    <Button onClick={loadData}>Load Data</Button>
  </div>
</div>
```

---

### DimensionPicker

**Component**: Dropdown (Ant Design Select)
**Trigger**: "+ Add Dimension" button

```typescript
<Select
  placeholder="Add dimension"
  options={[
    { value: 'campaign', label: 'Campaign' },
    { value: 'adGroup', label: 'Ad Group' },
    { value: 'keyword', label: 'Keyword' },
    { value: 'date', label: 'Date' },
  ]}
  onChange={handleAdd}
/>
```

**Behavior**:
- Click: Opens dropdown
- Select: Adds dimension to active list
- Already selected dimensions: Disabled in dropdown

---

### DimensionPills (Draggable)

**Library**: `@dnd-kit/core` + `@dnd-kit/sortable`
**Visual**: Green pills with × remove button

```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';

<DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
  <SortableContext items={dimensions} strategy={horizontalListSortingStrategy}>
    {dimensions.map((dim) => (
      <DimensionPill key={dim} id={dim} onRemove={() => removeDimension(dim)} />
    ))}
  </SortableContext>
</DndContext>
```

**Styling**:
- Background: `#00B96B` (brand accent)
- Text: White, 14px, 600 weight
- Padding: 4px 12px
- Border radius: 16px (pill shape)
- Remove icon: × (white, 12px, 4px margin-left)
- Drag cursor: grab / grabbing

---

### DateRangePicker

**Component**: Ant Design RangePicker
**Format**: YYYY-MM-DD

```typescript
import { DatePicker } from 'antd';

<DatePicker.RangePicker
  value={[dayjs(dateRange.start), dayjs(dateRange.end)]}
  onChange={(dates) => {
    setDateRange({
      start: dates[0].toDate(),
      end: dates[1].toDate(),
    });
  }}
  format="YYYY-MM-DD"
/>
```

---

### "Load Data" Button

**For "Load Data" button trigger behavior and state flow, see CLAUDE.md Key Patterns section.**

**Visual Specs:**

**Styling:**
- Type: Primary button (Ant Design)
- Background: `#00B96B` (brand accent)
- Text: "Load Data", white, 14px, 600 weight
- Height: 32px (default Ant button)
- Border radius: 6px

**States:**
- **Default**: `#00B96B` background, white text
- **Hover**: `brightness(0.95)`, cursor `pointer`
- **Disabled** (no unsaved changes): Gray background, cursor `not-allowed`
- **Loading**: Show spinner, background `#00B96B`, disabled clicks
- **Highlighted** (unsaved changes): Pulsing animation (optional), or brighter green

```typescript
<Button
  type="primary"
  onClick={loadData}         // Triggers data fetch (see CLAUDE.md for 8-step flow)
  loading={isLoading}        // Shows spinner during fetch
  disabled={!hasUnsavedChanges} // Only enabled when changes exist
>
  Load Data
</Button>
```

**Key Behavior:**
- **CRITICAL**: Only this button triggers data fetch (not dimension/date changes)
- Syncs active filters → loaded filters (see CLAUDE.md for complete specification)
- Updates URL with new filter state
- Collapses all expanded rows

---

## Component Library Split

### Decision Tree

```
What are you building?
  ↓
Data-heavy component? (table, form, date picker, select, modal) → Ant Design
  ↓
Layout/structural component? (sidebar, card, dialog, tabs) → shadcn/ui
  ↓
Unique UI need? → Custom (CSS Modules + Tailwind)
```

### Ant Design (Data Components)

| Component | Use Case | Example |
|-----------|----------|---------|
| Table | Hierarchical data, sorting, expansion | GenericDataTable |
| Form | Data entry, validation | User settings |
| DatePicker / RangePicker | Date selection | FilterToolbar |
| Select | Dropdown selection | DimensionPicker |
| Modal | Confirmations, forms | Delete confirmation |
| Input | Text entry | Search, filters |
| Button | Actions | Load Data, Submit |

**Customization**: Use `styles/theme.ts` (Ant theme config) + CSS Modules for overrides

---

### shadcn/ui (Layout Components)

| Component | Use Case | Example |
|-----------|----------|---------|
| Sidebar | Navigation | App sidebar |
| Card | Content containers | Dashboard widgets |
| Dialog | Overlays, alerts | Unsaved changes warning |
| Tabs | Content switching | Multi-section pages |
| Sheet | Slide-out panels | Settings panel |

**Customization**: Use Tailwind utilities + CSS variables

---

### Custom Components (CSS Modules)

**When to build custom**:
- Unique UI pattern not in libraries
- Need pixel-perfect control
- Performance optimization required

**Template**:
```typescript
// MyComponent.tsx
import styles from './MyComponent.module.css';

export function MyComponent() {
  return <div className={styles.container}>...</div>;
}

// MyComponent.module.css
.container {
  background: var(--color-bg-primary);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
```

---

## Layout Patterns

### Page Structure

```typescript
// Standard dashboard page
<div className="page-container">
  <header className="page-header">
    <h1>Page Title</h1>
  </header>

  <FilterToolbar />

  <main className="page-content">
    <DataTable />
  </main>
</div>
```

**Spacing**:
- Page padding: 24px
- Header margin-bottom: 16px
- FilterToolbar margin-bottom: 16px

---

### Card Pattern

**Visual**: White bg, 1px border, 8px radius, subtle shadow

```typescript
<div className="card">
  <div className="card-header">
    <Icon />
    <h3>Card Title</h3>
  </div>
  <div className="card-content">
    {children}
  </div>
</div>
```

**CSS**:
```css
.card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--spacing-lg);
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}
```

---

### Modal Pattern

**Component**: Ant Design Modal
**Sizes**: Small (400px), Medium (600px), Large (800px)

```typescript
<Modal
  title="Modal Title"
  open={isOpen}
  onOk={handleOk}
  onCancel={handleCancel}
  width={600}
>
  <p>Modal content</p>
</Modal>
```

---

## Visual Specifications

### Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Background (primary) | `#ffffff` | Main background |
| Background (secondary) | `#fafbfc` | Subtle backgrounds |
| Border | `#e8eaed` | All borders |
| Text (primary) | `#111827` | Body text |
| Text (secondary) | `#6b7280` | Muted text |
| Accent | `#00B96B` | Brand color, CTAs |
| Hover | `#f0f9ff` | Row hover |
| Expanded | `#e6f7ed` | Expanded row background |

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight spacing, icon margins |
| sm | 8px | Component padding (compact) |
| md | 12px | Default gaps, comfortable padding |
| lg | 16px | Section spacing |
| xl | 24px | Page padding |
| 2xl | 32px | Large section spacing |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| sm | 4px | Buttons, inputs |
| md | 8px | Cards, modals |
| lg | 12px | Large containers |
| full | 9999px | Pills, badges |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| md | `0 4px 6px rgba(0,0,0,0.07)` | Cards, dropdowns |
| lg | `0 10px 15px rgba(0,0,0,0.1)` | Modals, popovers |

### Typography

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 32px | 600 | 40px |
| H2 | 24px | 600 | 32px |
| H3 | 18px | 600 | 24px |
| Body | 14px | 400 | 20px |
| Caption | 12px | 400 | 16px |

**Table numbers**: Use `tabular-nums` font feature (NOT monospace font)
