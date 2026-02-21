# Tracker DB Schema Reference

Database: **neondb** (Neon serverless PostgreSQL), schema: `public`.
Last verified: 2026-02-21.

## Table Relationships

```
tracker_visitors (visitor_id PK)
  └── tracker_sessions (session_id PK, visitor_id FK → visitors)
        ├── tracker_page_views (page_view_id PK, session_id FK → sessions)
        │     ├── tracker_events (event_id PK, page_view_id FK → page_views)
        │     └── tracker_raw_heartbeats (no PK, page_view_id FK → page_views)
        └── tracker_raw_heartbeats (session_id FK → sessions)
```

## Tables

### tracker_visitors
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **visitor_id** | text | NO | — |
| first_seen_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |

PK: `visitor_id`

### tracker_sessions
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **session_id** | uuid | NO | gen_random_uuid() |
| visitor_id | text | NO | — |
| ip | inet | YES | — |
| user_agent | text | YES | — |
| timezone | varchar(200) | YES | — |
| language | varchar(150) | YES | — |
| created_at | timestamp without time zone | NO | CURRENT_TIMESTAMP |
| source_click_id | varchar(250) | YES | — |
| ff_funnel_id | varchar(250) | YES | — |
| utm_source | varchar(250) | YES | — |
| utm_medium | varchar(250) | YES | — |
| utm_campaign | varchar(250) | YES | — |
| utm_term | varchar(250) | YES | — |
| utm_content | varchar(250) | YES | — |
| placement | varchar(250) | YES | — |
| keyword | varchar(250) | YES | — |
| referrer | varchar(600) | YES | — |
| device_type | varchar(100) | YES | — |
| os_name | varchar(100) | YES | — |
| browser_name | varchar(100) | YES | — |
| country_code | varchar(100) | YES | — |
| entry_page_path | varchar(600) | YES | — |
| bot_score | numeric(3,2) | YES | — |
| property_dump | jsonb | NO | '{}'::jsonb |

PK: `session_id`. FK: `visitor_id → tracker_visitors.visitor_id`.

### tracker_page_views
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **page_view_id** | uuid | NO | — |
| session_id | uuid | NO | — |
| viewed_at | timestamp without time zone | NO | — |
| page_type | varchar(100) | YES | — |
| url_path | varchar(600) | YES | — |
| url_full | text | YES | — |
| referrer_url | text | YES | — |
| screen_width | integer | YES | — |
| screen_height | integer | YES | — |
| fcp_ms | integer | YES | — |
| lcp_ms | integer | YES | — |
| tti_ms | integer | YES | — |
| dcl_ms | integer | YES | — |
| load_ms | integer | YES | — |
| performance_metrics | jsonb | YES | — |
| time_on_page_final_ms | integer | YES | — |

PK: `page_view_id`. FK: `session_id → tracker_sessions.session_id`.

### tracker_events
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| **event_id** | uuid | NO | gen_random_uuid() |
| page_view_id | uuid | NO | — |
| event_at | timestamp without time zone | NO | — |
| event_name | varchar(100) | YES | — |
| action | varchar(100) | YES | — |
| signal_id | varchar(100) | YES | — |
| event_properties | jsonb | YES | — |

PK: `event_id`. FK: `page_view_id → tracker_page_views.page_view_id`.

### tracker_raw_heartbeats
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| page_view_id | uuid | NO | — |
| session_id | uuid | NO | — |
| cumulative_active_ms | integer | YES | — |
| cumulative_heartbeat_at | timestamp without time zone | NO | — |

**No primary key.** FKs: `page_view_id → page_views`, `session_id → sessions`.

## Indexes

### Duplicates (to be cleaned up)
- `idx_page_views_session_id` duplicates `idx_tracker_page_views_session_id`
- `idx_events_page_view_id` duplicates `idx_tracker_events_page_load_id`
- `idx_sessions_visitor_id` duplicates `idx_tracker_sessions_visitor_id`
- `idx_heartbeats_page_view_id` duplicates `idx_tracker_raw_heartbeats_page_load_id`
- `idx_heartbeats_session_id` duplicates `idx_tracker_raw_heartbeats_session_id`

## Known Quirks
- `ip` is `inet` type — compare with `ip::text LIKE ...`, not `ip = ''`
- `url_path` stores **full URLs** (e.g. `https://vitaliv.com/...`), not relative paths
- `entry_page_path` also stores full URLs
- `referrer` column was formerly misspelled `refferer` (fixed ~2026-02-21)
- `bot_score` was `double precision`, changed to `numeric(3,2)` on 2026-02-21
- `visitor_id` is the FingerprintJS `ff_visitor_id` string (e.g. `fk3UNC...`)
- All timestamps are `timestamp without time zone` (assumed UTC)

## Event Types
| event_name | action values | signal_id pattern | notes |
|------------|--------------|-------------------|-------|
| element_signal | in_view, out_view, click | CTA-1, CTA-2, hero-section, TESTIMONIAL-1, etc. | data-signal-id attribute |
| page_scroll | milestone | — | event_properties.scroll_percent: 25/50/75/100 |
| form | visible, invisible, started, submit, errors | — | form interaction tracking |
