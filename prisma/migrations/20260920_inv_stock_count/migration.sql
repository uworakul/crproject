BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[inv_stock_count_header] (
    [StockCountHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentNo] VARCHAR(20),
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [CountDate] DATE NOT NULL,
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [inv_stock_count_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_stock_count_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_stock_count_header] PRIMARY KEY CLUSTERED ([StockCountHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_stock_count_detail] (
    [StockCountDetailID] INT NOT NULL IDENTITY(1,1),
    [StockCountHeaderID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [CountedQty] DECIMAL(10,2) NOT NULL,
    [CountedSecondHandQty] DECIMAL(10,2) NOT NULL CONSTRAINT [inv_stock_count_detail_CountedSecondHandQty_df] DEFAULT 0,
    [CreatedDate] DATETIME CONSTRAINT [inv_stock_count_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_stock_count_detail] PRIMARY KEY CLUSTERED ([StockCountDetailID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_stock_count_detail_StockCountHeaderID] ON [dbo].[inv_stock_count_detail]([StockCountHeaderID]);

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_header] ADD CONSTRAINT [FK_inv_stock_count_header_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_header] ADD CONSTRAINT [FK_inv_stock_count_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_header] ADD CONSTRAINT [FK_inv_stock_count_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_header] ADD CONSTRAINT [FK_inv_stock_count_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_detail] ADD CONSTRAINT [FK_inv_stock_count_detail_header] FOREIGN KEY ([StockCountHeaderID]) REFERENCES [dbo].[inv_stock_count_header]([StockCountHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_count_detail] ADD CONSTRAINT [FK_inv_stock_count_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
