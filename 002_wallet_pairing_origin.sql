ALTER TABLE wallet_pairings
  ADD COLUMN IF NOT EXISTS website_origin TEXT;
