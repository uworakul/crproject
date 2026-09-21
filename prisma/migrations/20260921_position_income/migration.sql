BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mst_position_income] (
    [PositionIncomeID] INT NOT NULL IDENTITY(1,1),
    [PositionCode] VARCHAR(10) NOT NULL,
    [IncomeCode] VARCHAR(10) NOT NULL,
    [Amount] DECIMAL(10,2) NOT NULL,
    [RateBasis] VARCHAR(10) NOT NULL CONSTRAINT [mst_position_income_RateBasis_df] DEFAULT 'DAILY',
    [CreatedDate] DATETIME CONSTRAINT [mst_position_income_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_position_income] PRIMARY KEY CLUSTERED ([PositionIncomeID]),
    CONSTRAINT [UQ_mst_position_income] UNIQUE NONCLUSTERED ([PositionCode],[IncomeCode]),
    CONSTRAINT [CK_mst_position_income_RateBasis] CHECK ([RateBasis] IN ('DAILY','MONTHLY'))
);

-- AddForeignKey
ALTER TABLE [dbo].[mst_position_income] ADD CONSTRAINT [FK_mst_position_income_position] FOREIGN KEY ([PositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_position_income] ADD CONSTRAINT [FK_mst_position_income_income_type] FOREIGN KEY ([IncomeCode]) REFERENCES [dbo].[ref_income_type]([IncomeCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
