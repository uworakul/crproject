BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[trn_request_header] (
    [RequestHeaderID] INT NOT NULL IDENTITY(1,1),
    [DocumentCode] VARCHAR(20) NOT NULL,
    [DocumentNo] VARCHAR(20),
    [RequestDate] DATE NOT NULL,
    [Remark] NVARCHAR(300),
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [trn_request_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [trn_request_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_trn_request_header] PRIMARY KEY CLUSTERED ([RequestHeaderID])
);

-- CreateTable
CREATE TABLE [dbo].[trn_request_detail] (
    [RequestDetailID] INT NOT NULL IDENTITY(1,1),
    [RequestHeaderID] INT NOT NULL,
    [EmpCode] VARCHAR(15) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [DeductPerPeriod] DECIMAL(12,2) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [trn_request_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_trn_request_detail] PRIMARY KEY CLUSTERED ([RequestDetailID])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_trn_request_detail_EmpCode] ON [dbo].[trn_request_detail]([EmpCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_trn_request_detail_RequestHeaderID] ON [dbo].[trn_request_detail]([RequestHeaderID]);

-- Migrate existing trn_request rows (flat, 1 row = 1 employee) into
-- header+detail pairs, preserving RequestID as the new RequestHeaderID so
-- the detail insert below can reference it directly (1:1 for migrated rows).
-- DocumentCode is set to the old RequestType; DocumentNo/Remark are NULL
-- (these rows predate the document-number/remark concept).
SET IDENTITY_INSERT [dbo].[trn_request_header] ON;

INSERT INTO [dbo].[trn_request_header]
  ([RequestHeaderID], [DocumentCode], [DocumentNo], [RequestDate], [Remark], [Status], [CreatedBy], [CreatedDate], [SubmittedDate], [ApprovedBy], [ApprovedDate], [RejectedBy], [RejectedDate], [RejectReason], [UpdatedDate], [UpdatedBy])
SELECT
  [RequestID], [RequestType], NULL, CAST([CreatedDate] AS DATE), NULL, [Status], [CreatedBy], [CreatedDate], [SubmittedDate], [ApprovedBy], [ApprovedDate], [RejectedBy], [RejectedDate], [RejectReason], [UpdatedDate], [UpdatedBy]
FROM [dbo].[trn_request];

SET IDENTITY_INSERT [dbo].[trn_request_header] OFF;

INSERT INTO [dbo].[trn_request_detail]
  ([RequestHeaderID], [EmpCode], [Amount], [DeductPerPeriod], [CreatedBy], [CreatedDate])
SELECT
  [RequestID], [EmpCode], [Amount], [DeductPerPeriod], [CreatedBy], [CreatedDate]
FROM [dbo].[trn_request];

-- DropForeignKey
ALTER TABLE [dbo].[trn_request] DROP CONSTRAINT [FK_trn_request_mst_employee];

-- DropForeignKey
ALTER TABLE [dbo].[trn_request] DROP CONSTRAINT [FK_trn_request_sys_user_approved];

-- DropForeignKey
ALTER TABLE [dbo].[trn_request] DROP CONSTRAINT [FK_trn_request_sys_user_created];

-- DropForeignKey
ALTER TABLE [dbo].[trn_request] DROP CONSTRAINT [FK_trn_request_sys_user_rejected];

-- DropTable
DROP TABLE [dbo].[trn_request];

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_header] ADD CONSTRAINT [FK_trn_request_header_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_header] ADD CONSTRAINT [FK_trn_request_header_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_header] ADD CONSTRAINT [FK_trn_request_header_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_detail] ADD CONSTRAINT [FK_trn_request_detail_header] FOREIGN KEY ([RequestHeaderID]) REFERENCES [dbo].[trn_request_header]([RequestHeaderID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_detail] ADD CONSTRAINT [FK_trn_request_detail_mst_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
