# API Patterns

Essential API and database patterns.

**Response Format**: Always use `{ success, data, error }` envelope
**Database Clients**: PostgreSQL (`$1` placeholders) vs MariaDB (`?` placeholders) - never mix
**Hierarchical Keys**: `parent::child::value` format with `::` separator
**Dimension Order**: Array position = hierarchy depth (position matters)

See full details in the original documentation or ask for specific patterns.
