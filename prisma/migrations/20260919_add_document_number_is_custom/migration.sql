BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ref_document_number] ADD [IsCustomNumber] BIT NOT NULL CONSTRAINT [ref_document_number_IsCustomNumber_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
