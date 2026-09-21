BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_leave_type] ADD [TenureCountFrom] VARCHAR(20);

-- CreateTable
CREATE TABLE [dbo].[mst_leave_tenure_tier] (
    [TenureTierID] INT NOT NULL IDENTITY(1,1),
    [LeaveTypeCode] VARCHAR(10) NOT NULL,
    [MinYearsOfService] SMALLINT NOT NULL,
    [EntitledDays] DECIMAL(4,1) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [mst_leave_tenure_tier_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_leave_tenure_tier] PRIMARY KEY CLUSTERED ([TenureTierID]),
    CONSTRAINT [UQ_mst_leave_tenure_tier] UNIQUE NONCLUSTERED ([LeaveTypeCode],[MinYearsOfService])
);

-- AddForeignKey
ALTER TABLE [dbo].[mst_leave_tenure_tier] ADD CONSTRAINT [FK_mst_leave_tenure_tier_type] FOREIGN KEY ([LeaveTypeCode]) REFERENCES [dbo].[mst_leave_type]([LeaveTypeCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
