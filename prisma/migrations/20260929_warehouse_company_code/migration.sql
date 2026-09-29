BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_warehouse] ADD [CompanyCode] VARCHAR(10);

-- AddForeignKey
ALTER TABLE [dbo].[inv_warehouse] ADD CONSTRAINT [FK_inv_warehouse_ref_company] FOREIGN KEY ([CompanyCode]) REFERENCES [dbo].[ref_company]([CompanyCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
