-- 0001: key Cosmograph accounts by the Exo subject instead of the Clerk user id.
--
-- Exo Key (Exo ID) is Cosmograph's only identity provider. Accounts are keyed
-- by the `sub` claim of a verified Exo ID access token (the Exo user id).
-- The users primary key column was named `id` and held Clerk user ids
-- (`user_...`); it is renamed to `exo_subject`. The primary-key constraint
-- (users_pkey), the unique referral_code index, and every value are kept.
--
-- Child columns keep their names and now hold the Exo subject:
--   researcher_unlocks.user_id, ship_unlocks.user_id, users.referred_by.
--
-- Clerk-era rows: Clerk ids can never equal an Exo subject, so existing rows
-- simply stop matching anyone (no real users exist; staging/test data only).
-- They are intentionally NOT deleted here so this migration is non-destructive
-- and reversible. To drop them deliberately later, run (reviewed, by hand):
--   DELETE FROM researcher_unlocks WHERE user_id LIKE 'user\_%';
--   DELETE FROM ship_unlocks       WHERE user_id LIKE 'user\_%';
--   DELETE FROM users              WHERE exo_subject LIKE 'user\_%';
--
-- Idempotent: safe to run on a database where the rename already happened, and
-- a no-op on a fresh database (drizzle push then creates exo_subject).
-- Rollback: migrations/0001_users_exo_subject.down.sql.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'exo_subject'
  ) THEN
    ALTER TABLE users RENAME COLUMN id TO exo_subject;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'exo_subject'
  ) THEN
    COMMENT ON COLUMN users.exo_subject IS 'Exo ID subject (JWT sub) of the account owner';
  END IF;
END
$$;
