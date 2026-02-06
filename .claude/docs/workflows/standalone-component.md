# Workflow: Create Standalone Component

## Overview
Use this workflow when creating a new UI component that DOESN'T use the generic table/report patterns.

## When to Use
- Component is NOT a hierarchical data table
- Component is NOT a dashboard/report page
- Custom UI needs that don't fit existing patterns
- Unique interaction patterns

## When NOT to Use
- Hierarchical tables → Use GenericDataTable (see `new-dashboard.md`)
- Report pages → Use existing report patterns
- Similar to existing component → Review and reuse first

## Step-by-Step Implementation

### Step 1: Check for Similar Existing Components

Before creating new component, search for similar patterns:

```bash
# Search by component name/pattern
find components/ -name "*.tsx" | xargs grep -l "similar pattern"

# Search by functionality
grep -r "modal" components/
grep -r "form" components/
grep -r "filter" components/

# Check both libraries
ls components/ui/        # shadcn/ui components
ls components/          # Custom Ant Design components
```

**Stop if you find similar** - Reuse or extend existing component.

### Step 2: Choose Component Library

**Decision tree**:

| Component Type | Use | Why |
|---------------|-----|-----|
| **Forms, dropdowns, date pickers, modals, tables** | Ant Design | Data-heavy, rich features |
| **Sidebar, dialogs, cards, tabs, layout** | shadcn/ui | Structural, flexible styling |
| **Truly unique UI** | Custom | Neither library fits |

**Examples**:

**Ant Design**:
- Complex forms with validation
- Data tables with filtering/sorting
- Date range pickers
- Modals with multiple steps
- Select dropdowns with search

**shadcn/ui**:
- Application sidebar
- Dialog overlays
- Card containers
- Tab navigation
- Layout primitives

**Custom**:
- Unique visualizations
- Custom drag-and-drop
- Specialized interactions
- Brand-specific UI

### Step 3: Create Component File Structure

```bash
# Create component directory
mkdir -p components/my-feature

# Create files
touch components/my-feature/MyComponent.tsx
touch components/my-feature/MyComponent.module.css
touch components/my-feature/index.ts
```

### Step 4: Implement Component with CSS Module

**File**: `components/my-feature/MyComponent.tsx`

```typescript
'use client';
import { useState } from 'react';
import styles from './MyComponent.module.css';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{title}</h2>
      <button
        className={styles.button}
        onClick={() => {
          setIsActive(!isActive);
          onAction?.();
        }}
      >
        Toggle
      </button>
      {isActive && (
        <div className={styles.content}>
          Active content
        </div>
      )}
    </div>
  );
}
```

**Key points**:
- Use `'use client'` if component has interactivity
- Define TypeScript interface for props
- Use CSS Modules for component-specific styles
- Export named function (not default)

### Step 5: Create CSS Module

**File**: `components/my-feature/MyComponent.module.css`

```css
.container {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-sm);
}

.title {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.button {
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover {
  opacity: 0.9;
}

.content {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}
```

**Design tokens**: ALWAYS use CSS variables, NEVER hardcode values. See `styles/tokens.css` and `rules/project-overview.md` for token reference.

### Step 6: Export from Index

**File**: `components/my-feature/index.ts`

```typescript
export { MyComponent } from './MyComponent';
export type { MyComponentProps } from './MyComponent';
```

**Benefits**:
- Clean imports: `import { MyComponent } from '@/components/my-feature'`
- Can re-export multiple related components
- Can add barrel exports for related types

### Step 7: Use in Page

**File**: `app/my-page/page.tsx`

```typescript
'use client';
import { MyComponent } from '@/components/my-feature';

export default function MyPage() {
  const handleAction = () => {
    console.log('Action triggered');
  };

  return (
    <div>
      <h1>My Page</h1>
      <MyComponent
        title="My Component"
        onAction={handleAction}
      />
    </div>
  );
}
```

> Import rules: see CLAUDE.md "Code Conventions" — always use `@/` paths.

### Step 8: Test

```bash
# Type check
npm run build

# Run dev server
npm run dev

# Manual testing checklist:
# - [ ] Component renders correctly
# - [ ] Styles applied properly
# - [ ] Interactions work (click, hover, etc.)
# - [ ] Responsive at different screen sizes
# - [ ] Keyboard navigation works
# - [ ] Accessibility (screen reader, focus states)
```

## Using Ant Design Components

**Example**: Modal with form

```typescript
'use client';
import { Modal, Form, Input, Button } from 'antd';
import { useState } from 'react';
import styles from './MyModal.module.css';

interface MyModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: any) => void;
}

export function MyModal({ visible, onClose, onSubmit }: MyModalProps) {
  const [form] = Form.useForm();

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      className={styles.modal}
    >
      <Form
        form={form}
        onFinish={onSubmit}
        layout="vertical"
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Name is required' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Submit
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

**Customize Ant Design in CSS Module**:

```css
/* MyModal.module.css */
.modal :global(.ant-modal-content) {
  border-radius: var(--radius-md) !important;
  padding: var(--spacing-lg) !important;
}

.modal :global(.ant-form-item-label) {
  font-weight: 500;
}
```

## Using shadcn/ui Components

**Example**: Card with tabs

```typescript
'use client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import styles from './MyCard.module.css';

export function MyCard() {
  return (
    <Card className={styles.card}>
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>

        <TabsContent value="tab1">
          <p>Content for tab 1</p>
        </TabsContent>

        <TabsContent value="tab2">
          <p>Content for tab 2</p>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
```

## Common Patterns

### Pattern: Controlled vs Uncontrolled
```typescript
// Controlled (parent manages state)
<MyComponent value={value} onChange={setValue} />

// Uncontrolled (component manages state internally)
<MyComponent defaultValue={value} onValueChange={handleChange} />
```

### Pattern: Compound Components
```typescript
// Allow flexible composition
export function MyComponent({ children }: { children: React.ReactNode }) {
  return <div className={styles.container}>{children}</div>;
}

MyComponent.Header = function Header({ title }: { title: string }) {
  return <div className={styles.header}>{title}</div>;
};

MyComponent.Body = function Body({ children }: { children: React.ReactNode }) {
  return <div className={styles.body}>{children}</div>;
};

// Usage
<MyComponent>
  <MyComponent.Header title="Title" />
  <MyComponent.Body>Content</MyComponent.Body>
</MyComponent>
```

### Pattern: Render Props
```typescript
interface MyComponentProps {
  renderHeader: () => React.ReactNode;
  renderContent: (data: any) => React.ReactNode;
}

export function MyComponent({ renderHeader, renderContent }: MyComponentProps) {
  const data = { /* ... */ };

  return (
    <div>
      {renderHeader()}
      {renderContent(data)}
    </div>
  );
}
```

## Common Issues

### Issue: Styles not applying
**Causes**:
1. CSS Module not imported
2. Class name typo
3. Global styles overriding

**Solutions**:
1. Verify import: `import styles from './MyComponent.module.css'`
2. Check `className={styles.container}` matches `.container` in CSS
3. Use `!important` or increase specificity

### Issue: TypeScript errors on props
**Cause**: Props interface not matching usage
**Solution**: Define clear interface and make optional props explicit:
```typescript
interface Props {
  required: string;
  optional?: number;
  callback?: () => void;
}
```

### Issue: "use client" needed?
**Rule of thumb**:
- ✅ Need 'use client' if using: useState, useEffect, onClick, event handlers
- ❌ Don't need if: Just rendering, no interactivity, server-only

## Related Documentation
- See `.claude/docs/css.md` for styling guidelines
- See `.claude/docs/design.md` for UI patterns
- See `styles/tokens.css` for all design tokens
- See `styles/theme.ts` for Ant Design theme configuration
