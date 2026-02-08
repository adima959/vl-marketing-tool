# Marketing Pipeline Redesign

## Problem

Product owners need a workflow tool to manage marketing messages from idea through testing to scaling across multiple geos. The current pipeline prototype has flat stages with no per-geo tracking, no real data integration, and no asset management workflow.

## Core Concepts

### Hierarchy

```
Product (owned by a product owner)
  └── Angle (problem area / theme)
        └── Message (specific hypothesis — the card on the board)
              └── Geo (execution in a specific market)
                    ├── Campaigns (ad platform instances)
                    ├── Assets (landing pages, briefs, research)
                    └── Creatives (videos, images)
```

### Two-Level Stage Model

**Message Stage** — board columns, represents where the *concept* is:

| Stage | Meaning |
|-------|---------|
| Backlog | Idea exists, not being worked on |
| Production | First geo's hypothesis/copy/assets being developed |
| Testing | Live in at least one geo, gathering data |
| Scaling | Concept proven, actively expanding to more geos |
| Retired | Killed, or replaced by an iteration |

- Verdict is a **trigger** (spend threshold crossed), not a stage
- Testing → Scaling is a manual promotion by the product owner
- Other transitions can be auto-derived from geo stages but kept manual for now

**Geo Stage** — shown inside card detail, represents where each *geo's execution* is:

| Stage | Meaning |
|-------|---------|
| Setup | Geo added, assets/campaigns not ready |
| Production | Landing pages, creatives, campaigns being built |
| Testing | Campaigns live, gathering data |
| Live | Performing well, running steadily |
| Paused | Temporarily stopped |

Example — a message in "Scaling":
- NO: Live (original, proven)
- DE: Testing (just launched)
- SE: Setup (assets being translated)

## Data Model Changes

### New table: `app_pipeline_message_geos`

```sql
CREATE TABLE app_pipeline_message_geos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES app_pipeline_messages(id) ON DELETE CASCADE,
  geo app_geography NOT NULL,
  stage VARCHAR(20) NOT NULL DEFAULT 'setup',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  launched_at TIMESTAMPTZ,
  spend_threshold NUMERIC DEFAULT 300,
  drive_folder_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(message_id, geo)
);
```

### Modified: `app_pipeline_messages`

- Pipeline stage enum: `backlog | production | testing | scaling | retired` (remove `verdict` and `winner`, add `scaling`)
- Keep `verdict_type` and `verdict_notes` — these record decisions, not stages

### Unchanged tables

- `app_pipeline_campaigns` — already has `message_id` + `geo`, joins logically to message_geos
- `app_pipeline_assets` — already has `message_id` + `geo`
- `app_pipeline_creatives` — already has `message_id` + `geo`

## Board & Card Design

### Board (Kanban)

5 columns: Backlog | Production | Testing | Scaling | Retired

Card shows:
- Message name
- Product tag (color-coded) + Angle name
- Geo flags with mini status indicators
- Active campaign count

### Card Detail Panel (slide-out)

1. **Header**: Message name, product, angle, owner, message stage
2. **Hypothesis**: Pain point, core promise, key idea, hook direction, headlines (editable)
3. **Geo Tracks** — organized by geo first, then by type:
   - Each geo: collapsible row with flag + stage badge
   - Expanded: campaigns, landing pages, creatives for that geo
   - "Add Geo" button
   - Per-geo verdict banner when spend threshold crossed (Phase 2)
4. **Strategy notes** (rich text)
5. **Activity feed**

## Failure & Iteration

Three paths when something isn't working:

**Kill:**
- Kill a single geo → geo stage becomes `paused`, campaigns stopped
- Kill entire message → message moves to `retired`, all geos paused
- Data preserved for historical analysis

**Iterate (edit in-place):**
- Change copy/headlines/assets on same message
- Version number increments (v1 → v2)
- History tracks what changed and when
- Good for small tweaks

**Iterate (fork):**
- Creates new message with `parent_message_id` pointing to original
- Original goes to retired
- Lineage visible ("forked from: [original name]")
- Good for significant pivots

## Google Drive Integration

1. **Auto-create folders**: When a geo is added, create `{Product}/{Angle}/{Message}/{GEO}/` in Drive. Store folder ID on `message_geo` record.
2. **Upload**: "Upload" button per geo → file pushed to correct Drive folder → URL saved as asset.
3. **Open in Drive**: Direct link to the geo's folder.
4. **Rename sync**: When message/product/angle is renamed, update Drive folder names via API.

Not included: no sync from Drive back to tool, no file previews, no file browser.

## Split Testing

Deferred to its own planning session. Current state:
- Funnelflux handles traffic splitting via unique URLs
- A message+geo can have multiple landing page assets (URLs)
- On-page analytics and CRM data exists per URL in the database
- Needs: design how campaign data maps to individual URLs, comparison UI or link to analytics report
- Prerequisite: Phase 2 (campaign data integration) must be in place first

## Phased Delivery

### Phase 1: Core Pipeline Redesign
- New `message_geos` table + migration
- Revised pipeline stages (message-level + geo-level)
- Board with 5 columns
- Card detail panel reorganized by geo tracks
- Add/remove geos on a message
- Kill / Iterate (edit in-place + fork) actions
- Filters: owner, product, angle

### Phase 2: Campaign Data Integration
- Map campaigns to real ad platform data (external IDs)
- Auto-pull spend, CPA, conversions per campaign
- Show per-geo performance in card detail
- Spend/CPA on cards + verdict threshold alerts

### Phase 3: Google Drive Integration
- Auto-create folder structure on new geo
- Upload files to Drive, save as asset
- "Open in Drive" links
- Folder rename sync on entity renames

### Phase 4: Split Test Analysis
- Separate planning session
- Design URL-to-campaign data mapping
- Comparison UI or link to analytics
- Prerequisite: Phase 2

### Phase 5: Weekly Workflow & CMO View
- Evaluate need after Phases 1-2
- Task planning, results presentation, cross-owner overview
- May not be needed if board + filters suffice

## Perspectives Covered

**Product Owner:**
- Board shows all their messages and where each stands
- Geo tracks show exactly what's running where
- Kill/iterate actions give clear paths when things fail
- Drive integration keeps assets organized

**CMO:**
- Same board filtered by owner (Phase 1)
- Budget monitoring via campaign data (Phase 2)
- Dedicated overview if needed (Phase 5)
