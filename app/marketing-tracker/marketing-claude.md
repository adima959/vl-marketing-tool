PRD: Marketing Angle & Asset Tracker
Overview
A standalone module within the existing Next.js application that enables product owners to organize, track, and manage marketing angles, sub-angles, and associated assets across multiple products and geographies.
Problem Statement
Product owners currently lack a centralized system to document and track:

Marketing angles and their creative rationale
Sub-angles and specific executions
Associated assets (landing pages, ad creatives, copy, briefs)
Geographic variations of assets
The lifecycle status of each angle

This results in lost institutional knowledge, difficulty sharing learnings across products, and no clear visibility into what angles exist and their current state.
Goals
V1 Goals:

Provide a single source of truth for all marketing angles and assets
Enable product owners to document angle strategy (audience, pain points, hooks)
Track assets by geography (Norway, Sweden, Denmark)
Monitor status and lifecycle of angles and sub-angles
Maintain activity history for accountability

Non-Goals (V1):

Analytics or performance data integration
Version history for assets
Complex permissions or role-based access
Automated workflows or review cadences

Data Model
Hierarchy
Product Owner (User)
└── Product
└── Main Angle
├── Metadata (target audience, pain point, hook)
├── Description (rich text)
├── Status & Dates
└── Sub-Angle
├── Metadata (hook/idea)
├── Description (rich text)
├── Status & Dates
└── Assets (geo-tagged)
Entities
Users
FieldTypeRequiredNotesidUUIDYesPrimary keynameStringYesDisplay nameemailStringYesUnique identifiercreated_atTimestampYesAuto-generatedupdated_atTimestampYesAuto-updated
Products
FieldTypeRequiredNotesidUUIDYesPrimary keynameStringYese.g., "FlexiMove Advanced"descriptionRich TextNoProduct context and notesowner_idUUID (FK)YesReferences Userscreated_atTimestampYesAuto-generatedupdated_atTimestampYesAuto-updated
Main Angles
FieldTypeRequiredNotesidUUIDYesPrimary keyproduct_idUUID (FK)YesReferences ProductsnameStringYese.g., "The Active Senior"target_audienceTextNoWho this angle targetspain_pointTextNoPrimary psychological driverhookTextNoCore message/headlinedescriptionRich TextNoExtended notes and contextstatusEnumYesSee Status values belowcreated_atTimestampYesAuto-generatedlaunched_atTimestampNoWhen angle went liveupdated_atTimestampYesAuto-updated
Sub-Angles
FieldTypeRequiredNotesidUUIDYesPrimary keymain_angle_idUUID (FK)YesReferences Main AnglesnameStringYese.g., "The Grandparent Angle"hookTextNoSpecific hook/ideadescriptionRich TextNoExtended notes and contextstatusEnumYesSee Status values belowcreated_atTimestampYesAuto-generatedlaunched_atTimestampNoWhen sub-angle went liveupdated_atTimestampYesAuto-updated
Assets
FieldTypeRequiredNotesidUUIDYesPrimary keysub_angle_idUUID (FK)YesReferences Sub-AnglesgeoEnumYesNO, SE, DKtypeEnumYesSee Asset Types belownameStringYesDescriptive nameurlStringNoLink to external resourcecontentRich TextNoFor text-based assetsnotesTextNoAdditional contextcreated_atTimestampYesAuto-generatedupdated_atTimestampYesAuto-updated
Activity Log
FieldTypeRequiredNotesidUUIDYesPrimary keyuser_idUUID (FK)YesWho performed actionentity_typeStringYesProduct, MainAngle, SubAngle, Assetentity_idUUIDYesID of affected entityactionStringYescreated, updated, deletedchangesJSONBNoWhat changed (for updates)created_atTimestampYesWhen action occurred
Enums
Status Values:

idea — Concept, not yet in production
in_production — Being built (assets in creation)
live — Currently running in market
paused — Temporarily stopped
retired — No longer in use

Geographies:

NO — Norway
SE — Sweden
DK — Denmark

Asset Types:

landing_page — Webflow link
image_ads — Google Drive folder link
ugc_video — Video link
text_ad — Copy stored in system
brief — Brief stored in system or link
research — Research notes stored in system

User Interface
Navigation Flow
Dashboard → Product → Main Angle → Sub-Angle → Assets
Users drill down step-by-step, with the ability to preview/expand content at each level before navigating deeper.
Views

1. Dashboard

Products grouped by product owner
Each product shows: name, owner, count of angles, count of active angles
Click product to navigate to Product View

2. Product View

Product metadata (name, description, owner)
List of main angles with:

Name, status, target audience (truncated)
Expandable preview showing sub-angles
Created/launched dates

Click main angle to navigate to Main Angle View
Action: Create new main angle

3. Main Angle View

Full angle metadata (target audience, pain point, hook, description)
Status indicator with ability to change
List of sub-angles with:

Name, status, hook (truncated)
Expandable preview showing assets by geo
Created/launched dates

Click sub-angle to navigate to Sub-Angle View
Action: Create new sub-angle, edit angle

4. Sub-Angle View

Full sub-angle metadata (hook, description)
Status indicator with ability to change
Assets section with:

Toggle between: grouped by geo (tabs) OR flat list with geo filter
Each asset shows: type icon, name, link/preview, notes

Action: Create new asset, edit sub-angle

5. Asset Detail (Modal or Inline)

Full asset information
For text-based assets: rendered rich text content
For link-based assets: clickable URL with preview if possible
Action: Edit asset, delete asset

Components
Rich Text Editor:

Used for description fields at all levels
Basic formatting: bold, italic, bullet lists, numbered lists, links
Keep lightweight — not a full document editor

Status Badge:

Color-coded by status
Clickable to change status (with confirmation for backwards moves like Live → Paused)

Geo Tabs/Filter:

Toggle between tab view (NO | SE | DK) and filter dropdown
Remember user preference

Activity Feed:

Available at product level or as global view
Shows: "User X [action] [entity] — [timestamp]"
Filterable by user, action type, date range

Functional Requirements
CRUD Operations
EntityCreateReadUpdateDeleteUsersYesYesYesYes (soft delete)ProductsYesYesYesYes (cascade warning)Main AnglesYesYesYesYes (cascade warning)Sub-AnglesYesYesYesYes (cascade warning)AssetsYesYesYesYes
Cascade behavior:

Deleting a product deletes all its angles, sub-angles, and assets
Deleting a main angle deletes all its sub-angles and assets
Deleting a sub-angle deletes all its assets
Show confirmation with count of affected items

Status Transitions
All status transitions are allowed (no enforced workflow), but:

Moving to live sets launched_at if not already set
Moving from live to another status logs the transition in activity

Activity Logging
Log all create, update, delete actions automatically:

Capture user, timestamp, entity affected
For updates, capture changed fields (before/after in JSONB)

Search and Filter
Dashboard:

Filter by product owner
Search products by name

Within Product:

Filter angles by status
Search angles by name

Within Sub-Angle (Assets):

Filter by geo
Filter by asset type

Technical Requirements
Stack

Next.js (existing application)
PostgreSQL (existing database)
Rich text: Use existing editor component or lightweight library (e.g., Tiptap)

Database

Create new tables as defined in Data Model
Use UUIDs for all primary keys
Add appropriate indexes for foreign keys and commonly filtered fields (status, geo)
Use soft delete for users (is_deleted flag)

API

RESTful or tRPC endpoints matching existing app patterns
Standard CRUD endpoints for each entity
Bulk operations not required for V1

Performance

Paginate angle lists if product has >50 angles
Paginate activity log
Lazy load sub-angles on expand

Future Considerations (Post-V1)
These are explicitly out of scope but the architecture should not prevent them:

Analytics Integration — Connect to PostgreSQL analytics data to show performance metrics alongside angles
Review Cadence — "Monday review" feature showing angles launched N weeks ago needing decisions
Version History — Track changes to assets over time
Naming Conventions — Suggested or enforced naming patterns for angles/assets
Additional Geos — Adding new markets beyond NO, SE, DK
Permissions — Role-based access if team grows
Asset Previews — Thumbnail generation for image assets, embed previews for landing pages

Success Criteria
V1 is successful when:

Product owners can create and manage the full hierarchy (product → angle → sub-angle → asset)
All existing angle knowledge can be migrated into the system
A new team member can understand what angles exist for a product and their status
Product owners use this as their primary reference for angle documentation

Open Questions

User management: Should there be a simple admin view to manage users, or is this handled elsewhere?
Migration: Is there existing angle documentation that needs to be imported, or will this start fresh?
Asset storage: Should V1 support direct file uploads (stored in app), or are external links (Drive, Webflow) sufficient?
