BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_transaction] ADD [InstallmentDeduct] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_InstallmentDeduct_df] DEFAULT 0,
[WelfareFundAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_WelfareFundAmount_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
