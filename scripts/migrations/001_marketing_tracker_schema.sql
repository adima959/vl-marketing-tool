-- ============================================================================
-- Marketing Tracker Schema Migration
-- Version: 001
-- Description: Creates all tables, enums, and indexes for the Marketing Tracker
--              feature which manages marketing content hierarchy:
--              Products → Angles → Messages → Creatives/Assets
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- All enums prefixed with 'app_' to namespace within the database
-- ============================================================================

-- Status progression for angles and messages
CREATE TYPE app_angle_status AS ENUM (
    'idea',           -- Initial brainstorming stage
    'in_production',  -- Being developed/created
    'live',           -- Currently active in campaigns
    'paused',         -- Temporarily stopped
    'retired'         -- No longer in use
);

-- Geographic targeting regions
CREATE TYPE app_geography AS ENUM (
    'NO',  -- Norway
    'SE',  -- Sweden
    'DK'   -- Denmark
);

-- Types of supporting assets
CREATE TYPE app_asset_type AS ENUM (
    'landing_page',  -- Landing page URL/content
    'text_ad',       -- Ad copy/text
    'brief',         -- Creative brief document
    'research'       -- Research/insights document
);

-- Creative format types
CREATE TYPE app_creative_format AS ENUM (
    'ugc_video',     -- User-generated content video
    'static_image',  -- Static image ad
    'video'          -- Professional video ad
);

-- History tracking action types
CREATE TYPE app_history_action AS ENUM (
    'created',   -- Entity was created
    'updated',   -- Entity was modified
    'deleted'    -- Entity was soft-deleted
);

-- Entity types for polymorphic history tracking
CREATE TYPE app_entity_type AS ENUM (
    'product',
    'angle',
    'message',
    'creative',
    'asset'
);


-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Products Table
-- Top-level entity representing a product being marketed
-- ----------------------------------------------------------------------------
CREATE TABLE app_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,                    -- Rich text/HTML supported
    notes TEXT,                          -- Internal notes
    owner_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ              -- Soft delete timestamp
);

COMMENT ON TABLE app_products IS 'Top-level marketing products';
COMMENT ON COLUMN app_products.description IS 'Rich text/HTML description of the product';
COMMENT ON COLUMN app_products.owner_id IS 'User responsible for this product';
COMMENT ON COLUMN app_products.deleted_at IS 'Soft delete - NULL means active';


-- ----------------------------------------------------------------------------
-- Angles Table
-- Marketing angles/approaches for a product
-- ----------------------------------------------------------------------------
CREATE TABLE app_angles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES app_products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status app_angle_status NOT NULL DEFAULT 'idea',
    launched_at TIMESTAMPTZ,            -- When angle went live
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE app_angles IS 'Marketing angles/approaches for products';
COMMENT ON COLUMN app_angles.status IS 'Lifecycle status of the angle';
COMMENT ON COLUMN app_angles.launched_at IS 'Timestamp when angle first went live';


-- ----------------------------------------------------------------------------
-- Messages Table
-- Specific messaging variations within an angle
-- ----------------------------------------------------------------------------
CREATE TABLE app_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    angle_id UUID NOT NULL REFERENCES app_angles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    specific_pain_point TEXT,           -- The pain point being addressed
    core_promise TEXT,                  -- The main promise to customer
    key_idea TEXT,                      -- Central concept
    primary_hook_direction TEXT,        -- Hook/attention grabber approach
    headlines TEXT[],                   -- Array of headline variations
    status app_angle_status NOT NULL DEFAULT 'idea',
    launched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE app_messages IS 'Messaging variations within an angle';
COMMENT ON COLUMN app_messages.headlines IS 'PostgreSQL array of headline variations';
COMMENT ON COLUMN app_messages.specific_pain_point IS 'Customer pain point this message addresses';
COMMENT ON COLUMN app_messages.core_promise IS 'Main value proposition/promise';


-- ----------------------------------------------------------------------------
-- Creatives Table
-- Actual creative assets (videos, images) for a message, by geography
-- ----------------------------------------------------------------------------
CREATE TABLE app_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES app_messages(id) ON DELETE CASCADE,
    geo app_geography NOT NULL,
    name VARCHAR(255) NOT NULL,
    format app_creative_format NOT NULL,
    cta VARCHAR(255),                   -- Call to action text
    url TEXT,                           -- Link to creative asset
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE app_creatives IS 'Creative assets (videos, images) for messages';
COMMENT ON COLUMN app_creatives.geo IS 'Geographic market this creative targets';
COMMENT ON COLUMN app_creatives.format IS 'Type of creative (ugc_video, static_image, video)';
COMMENT ON COLUMN app_creatives.cta IS 'Call-to-action text';


-- ----------------------------------------------------------------------------
-- Assets Table
-- Supporting materials (landing pages, briefs, research) for messages
-- ----------------------------------------------------------------------------
CREATE TABLE app_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES app_messages(id) ON DELETE CASCADE,
    geo app_geography NOT NULL,
    type app_asset_type NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT,                           -- External URL if applicable
    content TEXT,                       -- Embedded content if applicable
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE app_assets IS 'Supporting materials for messages';
COMMENT ON COLUMN app_assets.type IS 'Type of asset (landing_page, text_ad, brief, research)';
COMMENT ON COLUMN app_assets.content IS 'Embedded content (for briefs, text ads, etc.)';


-- ----------------------------------------------------------------------------
-- Entity History Table (Audit Log)
-- Tracks all changes to entities for audit purposes
-- ----------------------------------------------------------------------------
CREATE TABLE app_entity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type app_entity_type NOT NULL,
    entity_id UUID NOT NULL,
    field_name VARCHAR(100) NOT NULL,   -- Field that changed (or '__entity__' for create/delete)
    old_value JSONB,                    -- Previous value (NULL for creates)
    new_value JSONB,                    -- New value (NULL for deletes)
    action app_history_action NOT NULL,
    changed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entity_snapshot JSONB               -- Full entity state on create/delete
);

COMMENT ON TABLE app_entity_history IS 'Audit log tracking all entity changes';
COMMENT ON COLUMN app_entity_history.field_name IS 'Field that changed, or __entity__ for full create/delete';
COMMENT ON COLUMN app_entity_history.entity_snapshot IS 'Complete entity state at time of create or delete';
COMMENT ON COLUMN app_entity_history.changed_by IS 'User who made the change (NULL if system or user deleted)';


-- ============================================================================
-- INDEXES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Products Indexes
-- ----------------------------------------------------------------------------

-- Active products lookup (most common query)
CREATE INDEX idx_products_active
    ON app_products(id)
    WHERE deleted_at IS NULL;

-- Products by owner
CREATE INDEX idx_products_owner
    ON app_products(owner_id)
    WHERE deleted_at IS NULL;

-- Products ordered by creation (for listing)
CREATE INDEX idx_products_created
    ON app_products(created_at DESC)
    WHERE deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- Angles Indexes
-- ----------------------------------------------------------------------------

-- Active angles by product (most common - listing angles for a product)
CREATE INDEX idx_angles_product_active
    ON app_angles(product_id)
    WHERE deleted_at IS NULL;

-- Angles by status (filtering by lifecycle stage)
CREATE INDEX idx_angles_status
    ON app_angles(status)
    WHERE deleted_at IS NULL;

-- Composite: product + status (common filter combination)
CREATE INDEX idx_angles_product_status
    ON app_angles(product_id, status)
    WHERE deleted_at IS NULL;

-- Recently launched angles
CREATE INDEX idx_angles_launched
    ON app_angles(launched_at DESC)
    WHERE deleted_at IS NULL AND launched_at IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Messages Indexes
-- ----------------------------------------------------------------------------

-- Active messages by angle (most common - listing messages for an angle)
CREATE INDEX idx_messages_angle_active
    ON app_messages(angle_id)
    WHERE deleted_at IS NULL;

-- Messages by status
CREATE INDEX idx_messages_status
    ON app_messages(status)
    WHERE deleted_at IS NULL;

-- Composite: angle + status
CREATE INDEX idx_messages_angle_status
    ON app_messages(angle_id, status)
    WHERE deleted_at IS NULL;

-- Recently launched messages
CREATE INDEX idx_messages_launched
    ON app_messages(launched_at DESC)
    WHERE deleted_at IS NULL AND launched_at IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Creatives Indexes
-- ----------------------------------------------------------------------------

-- Active creatives by message
CREATE INDEX idx_creatives_message_active
    ON app_creatives(message_id)
    WHERE deleted_at IS NULL;

-- Creatives by geography (for geo-specific reporting)
CREATE INDEX idx_creatives_geo
    ON app_creatives(geo)
    WHERE deleted_at IS NULL;

-- Creatives by format (for format-specific queries)
CREATE INDEX idx_creatives_format
    ON app_creatives(format)
    WHERE deleted_at IS NULL;

-- Composite: message + geo (common filter - creatives for a message in a region)
CREATE INDEX idx_creatives_message_geo
    ON app_creatives(message_id, geo)
    WHERE deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- Assets Indexes
-- ----------------------------------------------------------------------------

-- Active assets by message
CREATE INDEX idx_assets_message_active
    ON app_assets(message_id)
    WHERE deleted_at IS NULL;

-- Assets by type (for type-specific queries)
CREATE INDEX idx_assets_type
    ON app_assets(type)
    WHERE deleted_at IS NULL;

-- Assets by geography
CREATE INDEX idx_assets_geo
    ON app_assets(geo)
    WHERE deleted_at IS NULL;

-- Composite: message + type (common - specific asset types for a message)
CREATE INDEX idx_assets_message_type
    ON app_assets(message_id, type)
    WHERE deleted_at IS NULL;

-- Composite: message + geo
CREATE INDEX idx_assets_message_geo
    ON app_assets(message_id, geo)
    WHERE deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- Entity History Indexes
-- ----------------------------------------------------------------------------

-- Primary lookup: history for a specific entity
CREATE INDEX idx_history_entity
    ON app_entity_history(entity_type, entity_id);

-- History by entity ordered by time (viewing change history)
CREATE INDEX idx_history_entity_time
    ON app_entity_history(entity_type, entity_id, changed_at DESC);

-- Recent changes (for activity feed/dashboard)
CREATE INDEX idx_history_changed_at
    ON app_entity_history(changed_at DESC);

-- Changes by user (for user activity tracking)
CREATE INDEX idx_history_changed_by
    ON app_entity_history(changed_by, changed_at DESC)
    WHERE changed_by IS NOT NULL;

-- Changes by action type (for specific action queries)
CREATE INDEX idx_history_action
    ON app_entity_history(action, changed_at DESC);


-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all entity tables
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON app_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_angles_updated_at
    BEFORE UPDATE ON app_angles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON app_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creatives_updated_at
    BEFORE UPDATE ON app_creatives
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON app_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
