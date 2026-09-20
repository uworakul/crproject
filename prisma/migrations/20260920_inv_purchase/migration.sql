BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[inv_purchase_header] (
    [PurchaseHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentNo] VARCHAR(20),
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [SupplierCode] VARCHAR(15) NOT NULL,
    [SupplierDeliveryNo] VARCHAR(50),
    [DeliveryDate] DATE NOT NULL,
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [inv_purchase_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_purchase_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_purchase_header] PRIMARY KEY CLUSTERED ([PurchaseHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_purchase_detail] (
    [PurchaseDetailID] INT NOT NULL IDENTITY(1,1),
    [PurchaseHeaderID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [Qty] DECIMAL(10,2) NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [inv_purchase_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_purchase_detail] PRIMARY KEY CLUSTERED ([PurchaseDetailID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_purchase_detail_PurchaseHeaderID] ON [dbo].[inv_purchase_detail]([PurchaseHeaderID]);

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_header] ADD CONSTRAINT [FK_inv_purchase_header_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_header] ADD CONSTRAINT [FK_inv_purchase_header_supplier] FOREIGN KEY ([SupplierCode]) REFERENCES [dbo].[inv_supplier]([SupplierCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_header] ADD CONSTRAINT [FK_inv_purchase_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_header] ADD CONSTRAINT [FK_inv_purchase_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_header] ADD CONSTRAINT [FK_inv_purchase_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_detail] ADD CONSTRAINT [FK_inv_purchase_detail_header] FOREIGN KEY ([PurchaseHeaderID]) REFERENCES [dbo].[inv_purchase_header]([PurchaseHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_purchase_detail] ADD CONSTRAINT [FK_inv_purchase_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
