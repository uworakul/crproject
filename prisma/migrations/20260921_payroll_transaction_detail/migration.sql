BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_calculate_log] ADD [DocumentNo] VARCHAR(20);

-- CreateTable
CREATE TABLE [dbo].[trn_payroll_transaction_detail] (
    [DetailID] INT NOT NULL IDENTITY(1,1),
    [TransactionID] INT NOT NULL,
    [LineType] VARCHAR(10) NOT NULL,
    [Code] VARCHAR(10) NOT NULL,
    [Description] NVARCHAR(100) NOT NULL,
    [Hours] DECIMAL(6,2),
    [Days] DECIMAL(5,2),
    [Amount] DECIMAL(10,2) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [trn_payroll_transaction_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_trn_payroll_transaction_detail] PRIMARY KEY CLUSTERED ([DetailID]),
    CONSTRAINT [UQ_trn_payroll_transaction_detail] UNIQUE NONCLUSTERED ([TransactionID],[LineType],[Code]),
    CONSTRAINT [CK_trn_payroll_transaction_detail_LineType] CHECK ([LineType] IN ('INCOME','DEDUCTION'))
);

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction_detail] ADD CONSTRAINT [FK_trn_payroll_transaction_detail_transaction] FOREIGN KEY ([TransactionID]) REFERENCES [dbo].[trn_payroll_transaction]([TransactionID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
