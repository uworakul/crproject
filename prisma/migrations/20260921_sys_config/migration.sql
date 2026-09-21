BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[sys_config] (
    [SysConfigID] INT NOT NULL CONSTRAINT [sys_config_SysConfigID_df] DEFAULT 1,
    [RegistrationCode] NVARCHAR(100),
    [AccessKey] NVARCHAR(100),
    [PassChecking] BIT NOT NULL CONSTRAINT [sys_config_PassChecking_df] DEFAULT 0,
    [ContactPerson] NVARCHAR(100),
    [Tel] NVARCHAR(100),
    [FileFolder] NVARCHAR(100),
    [CreatedDate] DATETIME CONSTRAINT [sys_config_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_sys_config] PRIMARY KEY CLUSTERED ([SysConfigID])
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
