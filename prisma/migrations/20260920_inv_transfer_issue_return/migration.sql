
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[inv_transfer_header] (
    [TransferHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentNo] VARCHAR(20),
    [SourceWarehouseCode] VARCHAR(10) NOT NULL,
    [TargetWarehouseCode] VARCHAR(10) NOT NULL,
    [DeliveryNo] VARCHAR(50),
    [DeliveryDate] DATE NOT NULL,
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [inv_transfer_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_transfer_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_transfer_header] PRIMARY KEY CLUSTERED ([TransferHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_transfer_detail] (
    [TransferDetailID] INT NOT NULL IDENTITY(1,1),
    [TransferHeaderID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [Qty] DECIMAL(10,2) NOT NULL,
    [SecondHandQty] DECIMAL(10,2) NOT NULL CONSTRAINT [inv_transfer_detail_SecondHandQty_df] DEFAULT 0,
    [CreatedDate] DATETIME CONSTRAINT [inv_transfer_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_transfer_detail] PRIMARY KEY CLUSTERED ([TransferDetailID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_issue_header] (
    [IssueHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentNo] VARCHAR(20),
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [DeliveryNo] VARCHAR(50),
    [DeliveryDate] DATE NOT NULL,
    [EmpCode] VARCHAR(15) NOT NULL,
    [CashReceived] DECIMAL(12,2) NOT NULL CONSTRAINT [inv_issue_header_CashReceived_df] DEFAULT 0,
    [DeductPerPeriod] DECIMAL(12,2),
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [inv_issue_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_issue_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_issue_header] PRIMARY KEY CLUSTERED ([IssueHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_issue_detail] (
    [IssueDetailID] INT NOT NULL IDENTITY(1,1),
    [IssueHeaderID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [IsSecondHand] BIT NOT NULL CONSTRAINT [inv_issue_detail_IsSecondHand_df] DEFAULT 0,
    [Qty] DECIMAL(10,2) NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [IsWelfare] BIT NOT NULL CONSTRAINT [inv_issue_detail_IsWelfare_df] DEFAULT 0,
    [CreatedDate] DATETIME CONSTRAINT [inv_issue_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_issue_detail] PRIMARY KEY CLUSTERED ([IssueDetailID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_return_header] (
    [ReturnHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentNo] VARCHAR(20),
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [DeliveryNo] VARCHAR(50),
    [DeliveryDate] DATE NOT NULL,
    [EmpCode] VARCHAR(15) NOT NULL,
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [inv_return_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_return_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_return_header] PRIMARY KEY CLUSTERED ([ReturnHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_return_detail] (
    [ReturnDetailID] INT NOT NULL IDENTITY(1,1),
    [ReturnHeaderID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [IsSecondHand] BIT NOT NULL CONSTRAINT [inv_return_detail_IsSecondHand_df] DEFAULT 0,
    [Qty] DECIMAL(10,2) NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [inv_return_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_return_detail] PRIMARY KEY CLUSTERED ([ReturnDetailID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_transfer_detail_TransferHeaderID] ON [dbo].[inv_transfer_detail]([TransferHeaderID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_issue_detail_IssueHeaderID] ON [dbo].[inv_issue_detail]([IssueHeaderID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_return_detail_ReturnHeaderID] ON [dbo].[inv_return_detail]([ReturnHeaderID]);

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_header] ADD CONSTRAINT [FK_inv_transfer_header_source_warehouse] FOREIGN KEY ([SourceWarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_header] ADD CONSTRAINT [FK_inv_transfer_header_target_warehouse] FOREIGN KEY ([TargetWarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_header] ADD CONSTRAINT [FK_inv_transfer_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_header] ADD CONSTRAINT [FK_inv_transfer_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_header] ADD CONSTRAINT [FK_inv_transfer_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_detail] ADD CONSTRAINT [FK_inv_transfer_detail_header] FOREIGN KEY ([TransferHeaderID]) REFERENCES [dbo].[inv_transfer_header]([TransferHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_transfer_detail] ADD CONSTRAINT [FK_inv_transfer_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_header] ADD CONSTRAINT [FK_inv_issue_header_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_header] ADD CONSTRAINT [FK_inv_issue_header_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_header] ADD CONSTRAINT [FK_inv_issue_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_header] ADD CONSTRAINT [FK_inv_issue_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_header] ADD CONSTRAINT [FK_inv_issue_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_detail] ADD CONSTRAINT [FK_inv_issue_detail_header] FOREIGN KEY ([IssueHeaderID]) REFERENCES [dbo].[inv_issue_header]([IssueHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_issue_detail] ADD CONSTRAINT [FK_inv_issue_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_header] ADD CONSTRAINT [FK_inv_return_header_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_header] ADD CONSTRAINT [FK_inv_return_header_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_header] ADD CONSTRAINT [FK_inv_return_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_header] ADD CONSTRAINT [FK_inv_return_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_header] ADD CONSTRAINT [FK_inv_return_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_detail] ADD CONSTRAINT [FK_inv_return_detail_header] FOREIGN KEY ([ReturnHeaderID]) REFERENCES [dbo].[inv_return_header]([ReturnHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_return_detail] ADD CONSTRAINT [FK_inv_return_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

