BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_leave_type] ADD [EligibleEmployeeType] VARCHAR(20);

-- AlterTable
ALTER TABLE [dbo].[trn_leave_request] ADD [DocumentNo] VARCHAR(20),
[HoursRequested] DECIMAL(4,1),
[IsFullDay] BIT NOT NULL CONSTRAINT [trn_leave_request_IsFullDay_df] DEFAULT 1,
[RejectReason] NVARCHAR(500),
[RejectedBy] VARCHAR(20),
[RejectedDate] DATETIME;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
