BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [BlacklistCode] VARCHAR(20),
[BloodType] VARCHAR(5),
[BodyType] NVARCHAR(50),
[DistinguishingMarks] NVARCHAR(200),
[EmployeePositionAllowance] DECIMAL(10,2),
[Height] DECIMAL(5,1),
[MonthlySalary] DECIMAL(12,2),
[OTRatePerDay] DECIMAL(10,2),
[ReferrerEmpCode] VARCHAR(15),
[Weight] DECIMAL(5,1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
