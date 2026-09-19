BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ref_income_type] (
    [IncomeCode] VARCHAR(10) NOT NULL,
    [IncomeName] NVARCHAR(100) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [ref_income_type_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_ref_income_type] PRIMARY KEY CLUSTERED ([IncomeCode])
);

-- CreateTable
CREATE TABLE [dbo].[ref_deduction_type] (
    [DeductionCode] VARCHAR(10) NOT NULL,
    [DeductionName] NVARCHAR(100) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [ref_deduction_type_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_ref_deduction_type] PRIMARY KEY CLUSTERED ([DeductionCode])
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
