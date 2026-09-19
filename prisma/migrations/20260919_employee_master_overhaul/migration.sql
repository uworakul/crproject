BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_employee_debt] ALTER COLUMN [MovementID] INT NULL;
ALTER TABLE [dbo].[inv_employee_debt] ADD [DeductPerPeriod] DECIMAL(12,2),
[DeductionCode] VARCHAR(10),
[Description] NVARCHAR(200);

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [BirthDate] DATE,
[CertificateNo] VARCHAR(50),
[ChildrenCount] INT CONSTRAINT [mst_employee_ChildrenCount_df] DEFAULT 0,
[CompanyCode] VARCHAR(10),
[EmergencyContactName] NVARCHAR(150),
[EmergencyContactPhone] VARCHAR(20),
[FirstName] NVARCHAR(100),
[GuarantorName] NVARCHAR(150),
[IDCardAddress] NVARCHAR(300),
[IDCardExpiryDate] DATE,
[IDCardIssueDate] DATE,
[IDCardIssuedBy] NVARCHAR(100),
[LastName] NVARCHAR(100),
[MaritalStatus] VARCHAR(10),
[PhoneNo] VARCHAR(20),
[ProbationPassDate] DATE,
[Title] NVARCHAR(20);

-- Expand EmployeeStatus CHECK — "ACTIVE" stays as-is (labeled "ปกติ" in the
-- UI, kept because 4 existing pages filter on the literal string "ACTIVE"),
-- adding PROBATION/SUSPENDED/TERMINATED alongside it and RESIGNED.
ALTER TABLE [dbo].[mst_employee] DROP CONSTRAINT [CK_mst_employee_Status];
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [CK_mst_employee_Status]
  CHECK ([EmployeeStatus]='RESIGNED' OR [EmployeeStatus]='ACTIVE' OR [EmployeeStatus]='PROBATION' OR [EmployeeStatus]='SUSPENDED' OR [EmployeeStatus]='TERMINATED');

-- CreateTable
CREATE TABLE [dbo].[mst_employee_work_experience] (
    [WorkExperienceID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [CompanyName] NVARCHAR(150) NOT NULL,
    [PositionName] NVARCHAR(100),
    [Location] NVARCHAR(200),
    [Responsibility] NVARCHAR(500),
    [StartDate] DATE,
    [EndDate] DATE,
    [ResignReason] NVARCHAR(300),
    [CreatedDate] DATETIME CONSTRAINT [mst_employee_work_experience_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_employee_work_experience] PRIMARY KEY CLUSTERED ([WorkExperienceID])
);

-- CreateTable
CREATE TABLE [dbo].[mst_employee_training_experience] (
    [TrainingExperienceID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [Organization] NVARCHAR(150) NOT NULL,
    [Location] NVARCHAR(200),
    [Duration] NVARCHAR(100),
    [Topic] NVARCHAR(300),
    [StartDate] DATE,
    [EndDate] DATE,
    [CertificateNo] VARCHAR(50),
    [CreatedDate] DATETIME CONSTRAINT [mst_employee_training_experience_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_employee_training_experience] PRIMARY KEY CLUSTERED ([TrainingExperienceID])
);

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [FK_mst_employee_ref_company] FOREIGN KEY ([CompanyCode]) REFERENCES [dbo].[ref_company]([CompanyCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_work_experience] ADD CONSTRAINT [FK_mst_employee_work_experience_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_training_experience] ADD CONSTRAINT [FK_mst_employee_training_experience_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt] ADD CONSTRAINT [FK_inv_employee_debt_deduction_type] FOREIGN KEY ([DeductionCode]) REFERENCES [dbo].[ref_deduction_type]([DeductionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
