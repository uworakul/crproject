BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[trn_worksheet_detail] ADD [PositionCode] VARCHAR(10);

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_detail] ADD CONSTRAINT [FK_trn_worksheet_detail_position] FOREIGN KEY ([PositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
