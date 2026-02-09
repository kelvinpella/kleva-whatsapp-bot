-- Migration: Add multi-feature columns for enhanced image matching
-- Date: 2026-02-09
-- Purpose: Add texture_features and color_features columns to products table

-- Add new feature columns
ALTER TABLE products
ADD COLUMN IF NOT EXISTS texture_features TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS color_features TEXT DEFAULT NULL;

-- Add documentation comments
COMMENT ON COLUMN products.texture_features IS '16-dim edge magnitude histogram (JSON array) - captures surface patterns, hardware, stitching';
COMMENT ON COLUMN products.color_features IS '6-dim RGB statistics: [R_mean, R_std, G_mean, G_std, B_mean, B_std] (JSON array) - center-crop color features';

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('texture_features', 'color_features');
