-- This migration's ALTER TABLE was moved into 20260919_add_ref_document_number
-- (which CREATEs ref_document_number) — this file sorts before that one
-- alphabetically but needs the table to already exist. Moved 2026-09-24
-- while setting up multi-tenant support; see CLAUDE.md's "Multi-tenant"
-- entry. Already-applied environments are unaffected — `migrate deploy`
-- only checks migration names against `_prisma_migrations`, never
-- re-verifies content of ones already recorded as applied. Left as an
-- empty (no-op) transaction rather than deleting the file, since deleting
-- an already-applied migration folder would break `migrate deploy` for
-- environments that recorded it by this name.
BEGIN TRY

BEGIN TRAN;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
