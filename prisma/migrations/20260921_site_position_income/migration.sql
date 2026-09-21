BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[mst_site_position] (
    [SitePositionID] INT NOT NULL IDENTITY(1,1),
    [SiteCode] VARCHAR(10) NOT NULL,
    [PositionCode] VARCHAR(10) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [mst_site_position_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_site_position] PRIMARY KEY CLUSTERED ([SitePositionID]),
    CONSTRAINT [UQ_mst_site_position] UNIQUE NONCLUSTERED ([SiteCode],[PositionCode])
);

-- CreateTable
CREATE TABLE [dbo].[mst_site_position_income] (
    [SitePositionIncomeID] INT NOT NULL IDENTITY(1,1),
    [SitePositionID] INT NOT NULL,
    [IncomeCode] VARCHAR(10) NOT NULL,
    [Amount] DECIMAL(10,2) NOT NULL,
    [RateBasis] VARCHAR(10) NOT NULL CONSTRAINT [mst_site_position_income_RateBasis_df] DEFAULT 'DAILY',
    [CreatedDate] DATETIME CONSTRAINT [mst_site_position_income_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_site_position_income] PRIMARY KEY CLUSTERED ([SitePositionIncomeID]),
    CONSTRAINT [UQ_mst_site_position_income] UNIQUE NONCLUSTERED ([SitePositionID],[IncomeCode]),
    CONSTRAINT [CK_mst_site_position_income_RateBasis] CHECK ([RateBasis] IN ('DAILY','MONTHLY'))
);

-- AddForeignKey
ALTER TABLE [dbo].[mst_site_position] ADD CONSTRAINT [FK_mst_site_position_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_site_position] ADD CONSTRAINT [FK_mst_site_position_position] FOREIGN KEY ([PositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_site_position_income] ADD CONSTRAINT [FK_mst_site_position_income_site_position] FOREIGN KEY ([SitePositionID]) REFERENCES [dbo].[mst_site_position]([SitePositionID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_site_position_income] ADD CONSTRAINT [FK_mst_site_position_income_income_type] FOREIGN KEY ([IncomeCode]) REFERENCES [dbo].[ref_income_type]([IncomeCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
