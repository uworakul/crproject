BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [ReferralFeeClaimedDate] DATE;

-- AlterTable
ALTER TABLE [dbo].[trn_request_detail] ADD [AddToBlacklist] BIT CONSTRAINT [trn_request_detail_AddToBlacklist_df] DEFAULT 0,
[NewPositionCode] VARCHAR(10),
[OldIncome] DECIMAL(12,2),
[OldPositionCode] VARCHAR(10),
[RequestedResignDate] DATE,
[ResignReason] NVARCHAR(300);

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_detail] ADD CONSTRAINT [FK_trn_request_detail_old_position] FOREIGN KEY ([OldPositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request_detail] ADD CONSTRAINT [FK_trn_request_detail_new_position] FOREIGN KEY ([NewPositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
