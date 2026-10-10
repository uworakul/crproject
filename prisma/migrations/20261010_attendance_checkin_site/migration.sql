BEGIN TRY
BEGIN TRAN;
-- Original check-in site, filled only when the employee checked out at a
-- different site (SiteCode then holds the check-out site, which is primary).
ALTER TABLE [dbo].[trn_attendance_log] ADD [CheckInSiteCode] VARCHAR(10) NULL;
COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH
