BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_product] DROP COLUMN [Category];
ALTER TABLE [dbo].[inv_product] ADD [CategoryCode] VARCHAR(20);

-- CreateTable
CREATE TABLE [dbo].[inv_product_category] (
    [CategoryCode] VARCHAR(20) NOT NULL,
    [CategoryName] NVARCHAR(100) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [inv_product_category_IsActive_df] DEFAULT 1,
    [CreatedDate] DATETIME CONSTRAINT [inv_product_category_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_inv_product_category] PRIMARY KEY CLUSTERED ([CategoryCode])
);

-- AddForeignKey
ALTER TABLE [dbo].[inv_product] ADD CONSTRAINT [FK_inv_product_category] FOREIGN KEY ([CategoryCode]) REFERENCES [dbo].[inv_product_category]([CategoryCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
