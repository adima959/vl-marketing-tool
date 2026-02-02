# PRD: Marketing Tracker v2 - Message-Based Structure

## Overview

Restructure the Marketing Tracker to align with a **message-based hypothesis testing** framework. The core change: rename and simplify the hierarchy from `Product → MainAngle → SubAngle → Asset` to `Product → Angle → Message → Asset/Creative`.

This is an **internal planning and organization tool**, not a targeting or reporting system. The structure helps teams think, plan, and organize marketing messages—while acknowledging that actual ad delivery is controlled by platform algorithms (Meta, Google, etc.) running broad traffic.

---

## Problem Statement

The current structure conflates:
1. **Problem areas** (broad topics like "joint pain") with **specific message hypotheses** (like "can't play with grandkids")
2. **Creatives** (videos, images) with **supporting assets** (landing pages, briefs)

The refined structure separates these concerns:
- **Angle** = Problem area folder (simplified)
- **Message** = Specific hypothesis about how to communicate value
- **Creative** = Visual execution of a message
- **Asset** = Supporting materials (landing pages, copy, briefs)

---

## Goals

### V2 Goals
1. Rename `MainAngle` → `Angle` and `SubAngle` → `Message` throughout codebase
2. Simplify Angle to be a folder (name + description + status)
3. Enrich Message with hypothesis-focused fields (core promise, key idea, hook direction, headlines)
4. Separate Creatives from Assets as distinct entities
5. Maintain GEO tracking at Asset/Creative level
6. Fresh start with realistic sample data from Vitaliv

### Non-Goals (V2)
- Performance tracking/analytics integration (future)
- Multi-product sample data (just 1 product for now)
- Database migration of old dummy data

---

## Data Model

### Hierarchy

```
Product Owner (User)
└── Product
    └── Angle (problem area folder)
        ├── Status & Dates
        └── Message (hypothesis)
            ├── Message Data (pain point, promise, key idea, hook direction)
            ├── Headlines (multiple)
            ├── Status & Dates
            ├── Assets (landing pages, text ads, briefs, research)
            │   └── GEO-tagged
            └── Creatives (videos, images)
                └── GEO-tagged
```

### Entity Changes Summary

| Old Name | New Name | Change |
|----------|----------|--------|
| `MainAngle` | `Angle` | Simplified - just name, description, status |
| `SubAngle` | `Message` | Enriched - new fields for hypothesis data |
| `Asset` (type: image_ads, ugc_video) | `Creative` | Separated into own entity |
| `Asset` (type: landing_page, text_ad, brief, research) | `Asset` | Remains, minus creative types |

---

## Entities

### Users (unchanged)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| name | String | Yes | Display name |
| email | String | Yes | Unique identifier |
| created_at | Timestamp | Yes | Auto-generated |
| updated_at | Timestamp | Yes | Auto-updated |

### Products (simplified)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| name | String | Yes | e.g., "FlexiMove Advanced" |
| description | Rich Text | No | Product context |
| notes | Text | No | Internal notes |
| owner_id | UUID (FK) | Yes | References Users |
| created_at | Timestamp | Yes | Auto-generated |
| updated_at | Timestamp | Yes | Auto-updated |

### Angles (simplified from MainAngle)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| product_id | UUID (FK) | Yes | References Products |
| name | String | Yes | e.g., "Joint Pain & Stiffness" |
| description | Text | No | Short description of problem area |
| status | Enum | Yes | idea, in_production, live, paused, retired |
| created_at | Timestamp | Yes | Auto-generated |
| launched_at | Timestamp | No | When angle went live |
| updated_at | Timestamp | Yes | Auto-updated |

**Removed from MainAngle:** targetAudience, painPoint, hook (moved to Message level)

### Messages (enriched from SubAngle)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| angle_id | UUID (FK) | Yes | References Angles |
| name | String | Yes | e.g., "Can't play with grandkids" |
| description | Rich Text | No | Extended notes |
| specific_pain_point | Text | No | "I can't keep up with my grandchildren" |
| core_promise | Text | No | "Move freely and enjoy precious moments" |
| key_idea | Text | No | "Joint pain steals time with family" |
| primary_hook_direction | Text | No | "Emotional family scenes" |
| headlines | Text[] | No | Array of headline variations |
| status | Enum | Yes | idea, in_production, live, paused, retired |
| created_at | Timestamp | Yes | Auto-generated |
| launched_at | Timestamp | No | When message went live |
| updated_at | Timestamp | Yes | Auto-updated |

**New fields:** specific_pain_point, core_promise, key_idea, primary_hook_direction, headlines

### Creatives (NEW entity)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| message_id | UUID (FK) | Yes | References Messages (one-to-many) |
| geo | Enum | Yes | NO, SE, DK |
| name | String | Yes | Descriptive name |
| format | Enum | Yes | ugc_video, static_image, video |
| cta | String | No | "Shop Now", "Learn More", etc. |
| url | String | No | Link to Google Drive folder/asset |
| notes | Text | No | Additional context |
| created_at | Timestamp | Yes | Auto-generated |
| updated_at | Timestamp | Yes | Auto-updated |

**Note:** Creatives do NOT have their own status—they inherit lifecycle from their parent Message.

### Assets (reduced scope)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Primary key |
| message_id | UUID (FK) | Yes | References Messages |
| geo | Enum | Yes | NO, SE, DK |
| type | Enum | Yes | landing_page, text_ad, brief, research |
| name | String | Yes | Descriptive name |
| url | String | No | Link to external resource |
| content | Rich Text | No | For text-based assets |
| notes | Text | No | Additional context |
| created_at | Timestamp | Yes | Auto-generated |
| updated_at | Timestamp | Yes | Auto-updated |

**Removed types:** image_ads, ugc_video (now in Creatives)

---

## Enums

### Status Values (unchanged)
- `idea` — Concept, not yet in production
- `in_production` — Being built
- `live` — Currently running
- `paused` — Temporarily stopped
- `retired` — No longer in use

### Geographies (unchanged)
- `NO` — Norway
- `SE` — Sweden
- `DK` — Denmark

### Asset Types (reduced)
- `landing_page` — Webflow/landing page link
- `text_ad` — Copy stored in system
- `brief` — Brief document
- `research` — Research notes

### Creative Formats (NEW)
- `ugc_video` — User-generated content video
- `static_image` — Static image or carousel
- `video` — Produced video (non-UGC)

---

## TypeScript Types

```typescript
// Enums
export type AngleStatus = 'idea' | 'in_production' | 'live' | 'paused' | 'retired';
export type Geography = 'NO' | 'SE' | 'DK';
export type AssetType = 'landing_page' | 'text_ad' | 'brief' | 'research';
export type CreativeFormat = 'ugc_video' | 'static_image' | 'video';

// Angle (simplified from MainAngle)
export interface Angle extends BaseEntity {
  productId: string;
  name: string;
  description?: string;
  status: AngleStatus;
  launchedAt?: string;
  messages?: Message[];
  messageCount?: number;
}

// Message (enriched from SubAngle)
export interface Message extends BaseEntity {
  angleId: string;
  name: string;
  description?: string;
  specificPainPoint?: string;
  corePromise?: string;
  keyIdea?: string;
  primaryHookDirection?: string;
  headlines?: string[];
  status: AngleStatus;
  launchedAt?: string;
  assets?: Asset[];
  creatives?: Creative[];
  assetCount?: number;
  creativeCount?: number;
}

// Creative (NEW)
export interface Creative extends BaseEntity {
  messageId: string;
  geo: Geography;
  name: string;
  format: CreativeFormat;
  cta?: string;
  url?: string;
  notes?: string;
}

// Asset (reduced)
export interface Asset extends BaseEntity {
  messageId: string;
  geo: Geography;
  type: AssetType;
  name: string;
  url?: string;
  content?: string;
  notes?: string;
}
```

---

## Navigation Flow

```
Dashboard → Product → Angle → Message → Assets/Creatives
```

### Views

1. **Dashboard** — Products grouped by owner
2. **Product View** — List of Angles with status, expand to see Messages
3. **Angle View** — Angle metadata + list of Messages with their hypothesis data
4. **Message View** — Full message hypothesis data + Assets tab + Creatives tab

---

## API Endpoints

### Renamed Endpoints

| Old | New |
|-----|-----|
| `/api/marketing-tracker/angles` | `/api/marketing-tracker/angles` (same, but simplified data) |
| `/api/marketing-tracker/sub-angles` | `/api/marketing-tracker/messages` |
| `/api/marketing-tracker/assets` | `/api/marketing-tracker/assets` (reduced types) |
| — | `/api/marketing-tracker/creatives` (NEW) |

### New Endpoints

```
GET    /api/marketing-tracker/creatives
POST   /api/marketing-tracker/creatives
GET    /api/marketing-tracker/creatives/[creativeId]
PUT    /api/marketing-tracker/creatives/[creativeId]
DELETE /api/marketing-tracker/creatives/[creativeId]
```

---

## URL Structure

| Old | New |
|-----|-----|
| `/marketing-tracker/angle/[angleId]` | `/marketing-tracker/angle/[angleId]` |
| `/marketing-tracker/sub-angle/[subAngleId]` | `/marketing-tracker/message/[messageId]` |

---

## Sample Data

Based on real Vitaliv product: **Flex Repair** (Joint Health)

**Product Description:** Combination of turmeric, ginger, Boswellia Serrata, and vitamins that helps maintain the health of joints and bones, and supports joint flexibility.

**Key Ingredients:** Turmeric, Ginger, Boswellia Serrata, Vitamins

```
Product: Flex Repair
├── Name: Flex Repair
├── Description: Natural joint support with turmeric, ginger, and Boswellia Serrata
├── Notes: Subscription model, 40% first month discount
├── Owner: [Assigned user]

├── Angle: Joint Pain & Daily Life
│   ├── Status: live
│   ├── Description: Joint pain interfering with everyday activities
│   │
│   ├── Message: "Can't play with grandkids"
│   │   ├── Status: live
│   │   ├── Pain Point: "I can't keep up with my grandchildren anymore"
│   │   ├── Promise: "Move freely and be present for precious family moments"
│   │   ├── Key Idea: "Joint pain steals irreplaceable time with the people you love most"
│   │   ├── Hook Direction: Emotional grandparent scenes - before/after
│   │   ├── Headlines:
│   │   │   - "Keep up with your grandchildren again"
│   │   │   - "Don't let stiff joints steal these moments"
│   │   │   - "They grow up fast. Don't miss it."
│   │   ├── Assets:
│   │   │   - Landing Page (NO): vitaliv.no/flex-repair/grandkids
│   │   │   - Landing Page (SE): vitaliv.se/flex-repair/barnbarn
│   │   │   - Text Ad (DK): Facebook primary text - emotional copy
│   │   └── Creatives:
│   │       - UGC Video (NO): Grandparent testimonial - playing with grandkids
│   │       - Static Image (SE): Before/after lifestyle imagery
│   │
│   ├── Message: "Can't sleep due to joint pain"
│   │   ├── Status: in_production
│   │   ├── Pain Point: "I toss and turn all night because of joint pain"
│   │   ├── Promise: "Wake up refreshed, not in pain"
│   │   ├── Key Idea: "Night pain is different - your body heals during sleep, but pain prevents that healing"
│   │   ├── Hook Direction: Relatable night pain scenes, morning relief
│   │   ├── Headlines:
│   │   │   - "Finally sleep through the night"
│   │   │   - "Stop dreading bedtime"
│   │   │   - "Morning stiffness starts at night"
│   │   └── Assets/Creatives: TBD
│   │
│   └── Message: "Getting in/out of car is painful"
│       ├── Status: idea
│       ├── Pain Point: "Simple movements like getting out of my car have become a struggle"
│       ├── Promise: "Move like you used to - naturally and without thinking"
│       ├── Key Idea: "When small movements become obstacles, you've lost more than mobility - you've lost freedom"
│       ├── Hook Direction: Daily micro-moments of struggle → freedom
│       └── Headlines:
│           - "Remember when getting up was easy?"
│           - "Your car shouldn't feel like a trap"

├── Angle: Active Lifestyle
│   ├── Status: idea
│   ├── Description: Joint issues preventing sports and hobbies
│   │
│   ├── Message: "Back to golf"
│   │   ├── Pain Point: "I had to give up golf because of my joints"
│   │   ├── Promise: "Play 18 holes without paying for it tomorrow"
│   │   ├── Key Idea: "Golf isn't just a sport - it's your identity, your friends, your weekends"
│   │   └── Hook Direction: Golf-specific lifestyle, course footage
│   │
│   └── Message: "Skiing/active winter sports"
│       ├── Pain Point: "My knees can't handle the slopes anymore"
│       ├── Promise: "Hit the slopes all season"
│       ├── Key Idea: "Don't let joint pain put your skis in storage"
│       └── Hook Direction: Seasonal urgency, mountain lifestyle

└── Angle: Natural Alternative to Medication
    ├── Status: idea
    ├── Description: Positioning against prescription pain medication
    │
    └── Message: "Tired of pills"
        ├── Pain Point: "I don't want to depend on painkillers"
        ├── Promise: "Natural support your body can use"
        ├── Key Idea: "Turmeric and ginger have been used for centuries - now in a modern formula"
        └── Hook Direction: Natural ingredients, science-backed tradition
```

### Additional Products (for future expansion)

From vitaliv.com catalog:
- **Sleep Repair** - Lavender, lemon balm, hops, magnesium, B12
- **Balansera** - Digestive health, bloating, probiotics
- **Brainy** - Cognitive support, memory, focus
- **Hormonelle** - Menopause support for women
- **T-Formula** - Testosterone support for men 40+

---

## Migration Checklist

### Types
- [ ] Rename `MainAngle` → `Angle` in types/marketing-tracker.ts
- [ ] Rename `SubAngle` → `Message` in types/marketing-tracker.ts
- [ ] Add new Message fields (specificPainPoint, corePromise, keyIdea, primaryHookDirection, headlines)
- [ ] Create new `Creative` interface
- [ ] Remove image_ads, ugc_video from AssetType enum
- [ ] Create new `CreativeFormat` enum
- [ ] Update all Request/Response types

### Store
- [ ] Rename store state properties (mainAngles → angles, subAngles → messages)
- [ ] Add creatives state and actions
- [ ] Update all action names and references

### API Routes
- [ ] Rename `/sub-angles` → `/messages` endpoints
- [ ] Create `/creatives` endpoints
- [ ] Update all API handlers

### Pages
- [ ] Rename `/sub-angle/[subAngleId]` → `/message/[messageId]`
- [ ] Update all page components to use new terminology

### Components
- [ ] Update all component props and imports
- [ ] Add Creative-specific components (CreativeCard, CreativeList, etc.)

### Dummy Data
- [ ] Delete old dummy data
- [ ] Fetch Vitaliv product info
- [ ] Create new sample data following the structure

---

## Future Considerations (Post-V2)

- **Performance Layer**: Track metrics per traffic source (Meta, Google, Taboola)
- **Multi-product data**: Expand sample data to multiple products
- **Creative versioning**: Track iterations of creatives
- **A/B test tracking**: Link creatives to test results

---

## Success Criteria

V2 is successful when:
1. All references to "SubAngle" are replaced with "Message" in code and UI
2. Angle is simplified to name + description + status
3. Message contains the full hypothesis data (pain point, promise, key idea, hook direction, headlines)
4. Creatives are separated from Assets with their own entity
5. Sample data reflects real Vitaliv product information
6. Navigation and UI work with the new structure
