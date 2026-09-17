BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ref_sso_base] ADD [EffectiveDate] DATE;

-- CreateTable
CREATE TABLE [dbo].[ref_company] (
    [CompanyCode] VARCHAR(10) NOT NULL,
    [CompanyName] NVARCHAR(150) NOT NULL,
    [Address] NVARCHAR(300),
    [TaxID] VARCHAR(20),
    [SSORegistNo] VARCHAR(20),
    [ContactPhone] VARCHAR(20),
    CONSTRAINT [PK_ref_company] PRIMARY KEY CLUSTERED ([CompanyCode])
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
