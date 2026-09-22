BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[trn_payroll_transaction_detail] DROP CONSTRAINT [UQ_trn_payroll_transaction_detail];

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_transaction_detail] ADD [PositionCode] VARCHAR(10),
[SiteCode] VARCHAR(10);

-- CreateIndex
ALTER TABLE [dbo].[trn_payroll_transaction_detail] ADD CONSTRAINT [UQ_trn_payroll_transaction_detail] UNIQUE NONCLUSTERED ([TransactionID], [LineType], [Code], [SiteCode]);

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction_detail] ADD CONSTRAINT [FK_trn_payroll_transaction_detail_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction_detail] ADD CONSTRAINT [FK_trn_payroll_transaction_detail_position] FOREIGN KEY ([PositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
