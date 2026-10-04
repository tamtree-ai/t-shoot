-- A sign-off is never edited, with one exception the database itself makes: when a reviewer row is
-- deleted (their share, client or project was), the foreign key's ON DELETE SET NULL clears
-- reviewer_id. 0009's trigger refused that, so deleting anything with a sign-off under it failed.
-- Now the one change allowed is reviewer_id going from a value to null with every other column
-- untouched; the signed name, email, time, address and file fingerprint stay on the record.
CREATE OR REPLACE FUNCTION "studio_decisions_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.reviewer_id IS NOT NULL
     AND NEW.reviewer_id IS NULL
     AND (to_jsonb(NEW) - 'reviewer_id') = (to_jsonb(OLD) - 'reviewer_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'studio_decisions is append-only';
END;
$$;
