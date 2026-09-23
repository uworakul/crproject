BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_lock] ADD [IsApproved] BIT NOT NULL CONSTRAINT [DF_trn_payroll_lock_IsApproved] DEFAULT 0, [ApprovedBy] VARCHAR(20), [ApprovedDate] DATETIME;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_lock] ADD CONSTRAINT [FK_trn_payroll_lock_approver] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
