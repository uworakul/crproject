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

-- AlterTable
-- Moved here from 20260917_add_audit_columns (which sorts after this file
-- alphabetically but needs ref_company to already exist) — see comment
-- there. Applied together with the CREATE TABLE above so a fresh tenant DB
-- gets both in the correct order in one pass.
ALTER TABLE [dbo].[ref_company] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_company_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
