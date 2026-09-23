BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [Tbor7Remark] NVARCHAR(300),
[Tbor7Topic1] BIT CONSTRAINT [mst_employee_Tbor7Topic1_df] DEFAULT 0,
[Tbor7Topic10] BIT CONSTRAINT [mst_employee_Tbor7Topic10_df] DEFAULT 0,
[Tbor7Topic2] BIT CONSTRAINT [mst_employee_Tbor7Topic2_df] DEFAULT 0,
[Tbor7Topic3] BIT CONSTRAINT [mst_employee_Tbor7Topic3_df] DEFAULT 0,
[Tbor7Topic4] BIT CONSTRAINT [mst_employee_Tbor7Topic4_df] DEFAULT 0,
[Tbor7Topic5] BIT CONSTRAINT [mst_employee_Tbor7Topic5_df] DEFAULT 0,
[Tbor7Topic6] BIT CONSTRAINT [mst_employee_Tbor7Topic6_df] DEFAULT 0,
[Tbor7Topic7] BIT CONSTRAINT [mst_employee_Tbor7Topic7_df] DEFAULT 0,
[Tbor7Topic8] BIT CONSTRAINT [mst_employee_Tbor7Topic8_df] DEFAULT 0,
[Tbor7Topic9] BIT CONSTRAINT [mst_employee_Tbor7Topic9_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

