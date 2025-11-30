/*
  # Add slug field to member registrations

  1. New Column
    - `slug` (text, unique)
      - SEO-friendly URL identifier based on full name
      - Auto-generated from full_name field
      - Unique constraint to prevent duplicates

  2. Index
    - Add index on slug for fast lookups

  3. Data Migration
    - Generate slugs for existing records
*/

-- Add slug column
ALTER TABLE member_registrations 
ADD COLUMN slug text;

-- Create function to generate slug from name
CREATE OR REPLACE FUNCTION generate_slug(input_text text)
RETURNS text AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(input_text, '[^a-zA-Z0-9\s]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Generate slugs for existing records
UPDATE member_registrations 
SET slug = generate_slug(full_name) || '-' || substring(id::text, 1, 8)
WHERE slug IS NULL;

-- Make slug NOT NULL and add unique constraint
ALTER TABLE member_registrations 
ALTER COLUMN slug SET NOT NULL;

-- Add unique constraint
ALTER TABLE member_registrations 
ADD CONSTRAINT member_registrations_slug_unique UNIQUE (slug);

-- Add index for fast lookups
CREATE INDEX idx_member_registrations_slug ON member_registrations (slug);

-- Create trigger to auto-generate slug on insert
CREATE OR REPLACE FUNCTION set_member_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := generate_slug(NEW.full_name) || '-' || substring(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_member_slug
  BEFORE INSERT ON member_registrations
  FOR EACH ROW
  EXECUTE FUNCTION set_member_slug();