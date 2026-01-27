# State Management Patterns

Essential Zustand store patterns.

**Dual-State**: Active (editing) vs Loaded (server truth) - only "Load Data" button syncs them
**URL Sync**: Filters persist in URL params for shareability (not column visibility)
**Persistence**: columnStore only (user preferences), not reportStore (fetched fresh)
**Store Independence**: No inter-store imports, components orchestrate between stores

See full store structure, async patterns, and loading state management in original documentation or ask for specifics.
