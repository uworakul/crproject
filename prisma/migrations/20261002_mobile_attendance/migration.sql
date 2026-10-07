BEGIN TRY

BEGIN TRAN;

-- Allow the new EMPLOYEE role (mobile self-service)
ALTER TABLE [dbo].[sys_user] DROP CONSTRAINT [CK_sys_user_Role];
ALTER TABLE [dbo].[sys_user] ADD CONSTRAINT [CK_sys_user_Role] CHECK ([Role] IN ('SITE_HEAD','APPROVER','ADMIN','PAYROLL','HR','STORE','EMPLOYEE'));

CREATE TABLE [dbo].[mst_site_location] (
    [SiteCode] VARCHAR(10) NOT NULL,
    [Latitude] DECIMAL(9,6) NOT NULL,
    [Longitude] DECIMAL(9,6) NOT NULL,
    [LocationName] NVARCHAR(200),
    [RadiusMeters] INT NOT NULL,
    [CreatedDate] DATETIME CONSTRAINT [DF_mst_site_location_CreatedDate] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_mst_site_location] PRIMARY KEY CLUSTERED ([SiteCode]),
    CONSTRAINT [FK_mst_site_location_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [CK_mst_site_location_Radius] CHECK ([RadiusMeters] > 0)
);

CREATE TABLE [dbo].[trn_attendance_log] (
    [AttendanceID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [SiteCode] VARCHAR(10) NOT NULL,
    [CheckInTime] DATETIME NOT NULL,
    [CheckInLat] DECIMAL(9,6) NOT NULL,
    [CheckInLng] DECIMAL(9,6) NOT NULL,
    [CheckInDistance] INT NOT NULL,
    [CheckOutTime] DATETIME,
    [CheckOutLat] DECIMAL(9,6),
    [CheckOutLng] DECIMAL(9,6),
    [CheckOutDistance] INT,
    [CreatedDate] DATETIME CONSTRAINT [DF_trn_attendance_log_CreatedDate] DEFAULT CURRENT_TIMESTAMP,
    [CreatedBy] VARCHAR(20),
    [UpdatedDate] DATETIME,
    [UpdatedBy] VARCHAR(20),
    CONSTRAINT [PK_trn_attendance_log] PRIMARY KEY CLUSTERED ([AttendanceID]),
    CONSTRAINT [FK_trn_attendance_log_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT [FK_trn_attendance_log_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE NONCLUSTERED INDEX [IX_trn_attendance_log_emp_time] ON [dbo].[trn_attendance_log]([EmpCode], [CheckInTime]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
