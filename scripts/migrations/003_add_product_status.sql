-- Migration: Add status field to products
-- Run this migration manually on the database

-- Create product status enum (simpler than angle status - just active/inactive)
CREATE TYPE app_product_status AS ENUM ('active', 'inactive');

-- Add status column with default 'active' (all existing products become active)
ALTER TABLE app_products
ADD COLUMN status app_product_status NOT NULL DEFAULT 'active';

-- Add index for filtering by status (common query pattern)
CREATE INDEX idx_products_status ON app_products(status) WHERE deleted_at IS NULL;
