BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[inv_employee_debt_payment] (
    [PaymentID] INT NOT NULL IDENTITY(1,1),
    [DebtID] INT NOT NULL,
    [PaymentDate] DATETIME NOT NULL CONSTRAINT [inv_employee_debt_payment_PaymentDate_df] DEFAULT CURRENT_TIMESTAMP,
    [Amount] DECIMAL(12,2) NOT NULL,
    [RemainingAfter] DECIMAL(12,2) NOT NULL,
    [Source] VARCHAR(20) NOT NULL,
    [ReturnHeaderID] INT,
    [CreatedBy] VARCHAR(20),
    [CreatedDate] DATETIME CONSTRAINT [inv_employee_debt_payment_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_inv_employee_debt_payment] PRIMARY KEY CLUSTERED ([PaymentID]),
    CONSTRAINT [CK_inv_employee_debt_payment_Source] CHECK ([Source] IN ('INVENTORY_RETURN','MANUAL_EDIT'))
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_employee_debt_payment_DebtID] ON [dbo].[inv_employee_debt_payment]([DebtID]);

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt_payment] ADD CONSTRAINT [FK_inv_employee_debt_payment_debt] FOREIGN KEY ([DebtID]) REFERENCES [dbo].[inv_employee_debt]([DebtID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt_payment] ADD CONSTRAINT [FK_inv_employee_debt_payment_return] FOREIGN KEY ([ReturnHeaderID]) REFERENCES [dbo].[inv_return_header]([ReturnHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
