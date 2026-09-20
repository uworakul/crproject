BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_product] ADD [UnitOfMeasure] NVARCHAR(20);

-- CreateTable
CREATE TABLE [dbo].[inv_secondhand_stock] (
    [SecondhandStockID] INT NOT NULL IDENTITY(1,1),
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [Qty] DECIMAL(10,2) NOT NULL CONSTRAINT [inv_secondhand_stock_Qty_df] DEFAULT 0,
    [CreatedDate] DATETIME CONSTRAINT [inv_secondhand_stock_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_secondhand_stock] PRIMARY KEY CLUSTERED ([SecondhandStockID]),
    CONSTRAINT [UQ_inv_secondhand_stock_warehouse_product] UNIQUE NONCLUSTERED ([WarehouseCode],[ProductCode])
);

-- AddForeignKey
ALTER TABLE [dbo].[inv_secondhand_stock] ADD CONSTRAINT [FK_inv_secondhand_stock_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_secondhand_stock] ADD CONSTRAINT [FK_inv_secondhand_stock_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
