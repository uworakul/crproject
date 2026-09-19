BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ref_document_number] (
    [DocumentNumberID] INT NOT NULL IDENTITY(1,1),
    [DocumentCode] VARCHAR(30) NOT NULL,
    [Description] NVARCHAR(200),
    [UseYearMonthPrefix] BIT NOT NULL CONSTRAINT [ref_document_number_UseYearMonthPrefix_df] DEFAULT 0,
    [LatestNumber] INT NOT NULL CONSTRAINT [ref_document_number_LatestNumber_df] DEFAULT 0,
    [CreatedDate] DATETIME CONSTRAINT [ref_document_number_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_ref_document_number] PRIMARY KEY CLUSTERED ([DocumentNumberID]),
    CONSTRAINT [UQ_ref_document_number_DocumentCode] UNIQUE NONCLUSTERED ([DocumentCode])
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
