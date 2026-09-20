BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_employee_debt] ADD [RequestHeaderID] INT;

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt] ADD CONSTRAINT [FK_inv_employee_debt_request_header] FOREIGN KEY ([RequestHeaderID]) REFERENCES [dbo].[trn_request_header]([RequestHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
