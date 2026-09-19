BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ref_welfare_fund] (
    [WelfareFundID] INT NOT NULL IDENTITY(1,1),
    [EffectiveYear] SMALLINT NOT NULL,
    [EffectiveDate] DATE,
    [EmployeeRate] DECIMAL(5,4) NOT NULL,
    [EmployerRate] DECIMAL(5,4) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [ref_welfare_fund_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_ref_welfare_fund] PRIMARY KEY CLUSTERED ([WelfareFundID])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
