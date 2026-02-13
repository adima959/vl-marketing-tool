---
paths:
  - "styles/**"
  - "components/**"
  - "**/*.module.css"
---

# CSS Gotchas

- **Ant Design v6.2** — `.ant-select-selector` class no longer exists. Target `.ant-select` for borders
- **Table scroll width**: NEVER `scroll={{ x: 'max-content' }}`. ALWAYS `scroll={{ x: attributeWidth + metricsWidth }}`
- **Sticky headers**: `.ant-table-wrapper` needs `overflow: visible !important`. NEVER add `width: max-content` on header/body tables (breaks scroll sync)
- **Table numbers**: Use `font-feature-settings: 'tnum'` (tabular-nums), NOT monospace font
- **Design tokens**: NEVER hardcode colors/spacing. Use `var(--token)` or `tokens.ts`
- **Ant overrides**: CSS Modules + `:global(.ant-class)` pattern. Try without `!important` first
- **Modal base**: Every `<Modal>` must include `className={modalStyles.modal}` from `styles/components/modal.module.css`
- **Editable cells**: Use `tableLayout="fixed"` to prevent column width jumps
