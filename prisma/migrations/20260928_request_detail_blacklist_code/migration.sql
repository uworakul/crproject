BEGIN TRY

BEGIN TRAN;

-- Drop the DEFAULT constraint before dropping the column (SQL Server
-- requires this) — no rows have AddToBlacklist=true (verified before this
-- migration), safe to drop outright rather than migrate data.
ALTER TABLE [dbo].[trn_request_detail] DROP CONSTRAINT [trn_request_detail_AddToBlacklist_df];
ALTER TABLE [dbo].[trn_request_detail] DROP COLUMN [AddToBlacklist];

-- AlterTable
ALTER TABLE [dbo].[trn_request_detail] ADD [BlacklistCode] VARCHAR(20);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
