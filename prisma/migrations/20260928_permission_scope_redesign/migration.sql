BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[sys_user_permission] ADD [CanSubmit] BIT NOT NULL CONSTRAINT [sys_user_permission_CanSubmit_df] DEFAULT 0;

-- CreateTable
CREATE TABLE [dbo].[sys_user_company] (
    [SysUserCompanyID] INT NOT NULL IDENTITY(1,1),
    [UserID] VARCHAR(20) NOT NULL,
    [CompanyCode] VARCHAR(10) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [sys_user_company_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    CONSTRAINT [PK_sys_user_company] PRIMARY KEY CLUSTERED ([SysUserCompanyID]),
    CONSTRAINT [UQ_sys_user_company] UNIQUE NONCLUSTERED ([UserID],[CompanyCode])
);

-- CreateTable
CREATE TABLE [dbo].[sys_user_employee_type] (
    [SysUserEmployeeTypeID] INT NOT NULL IDENTITY(1,1),
    [UserID] VARCHAR(20) NOT NULL,
    [EmployeeType] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [sys_user_employee_type_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    CONSTRAINT [PK_sys_user_employee_type] PRIMARY KEY CLUSTERED ([SysUserEmployeeTypeID]),
    CONSTRAINT [UQ_sys_user_employee_type] UNIQUE NONCLUSTERED ([UserID],[EmployeeType])
);

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_company] ADD CONSTRAINT [FK_sys_user_company_sys_user] FOREIGN KEY ([UserID]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_company] ADD CONSTRAINT [FK_sys_user_company_ref_company] FOREIGN KEY ([CompanyCode]) REFERENCES [dbo].[ref_company]([CompanyCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_employee_type] ADD CONSTRAINT [FK_sys_user_employee_type_sys_user] FOREIGN KEY ([UserID]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
