BEGIN TRY

BEGIN TRAN;

-- RenameColumn (sp_rename, not DROP+ADD, to preserve the column even though
-- no rows have a value in it yet — 2026-09-28, "REFERRAL" document code
-- renamed to "COMMISSION" per user request)
EXEC sp_rename 'dbo.mst_employee.ReferralFeeClaimedDate', 'CommissionClaimedDate', 'COLUMN';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
