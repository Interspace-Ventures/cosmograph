-- Rollback for 0001: rename users.exo_subject back to id. Not applied
-- automatically; run by hand only together with reverting the code change.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'exo_subject'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'id'
  ) THEN
    ALTER TABLE users RENAME COLUMN exo_subject TO id;
  END IF;
END
$$;
