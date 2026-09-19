BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ref_deduction_type] ADD [IsInstallment] BIT NOT NULL CONSTRAINT [ref_deduction_type_IsInstallment_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
