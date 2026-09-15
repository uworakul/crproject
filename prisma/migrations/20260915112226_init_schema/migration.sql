BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[mst_site] (
    [SiteCode] VARCHAR(10) NOT NULL,
    [SiteName] NVARCHAR(150) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [mst_site_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_mst_site] PRIMARY KEY CLUSTERED ([SiteCode])
);

-- CreateTable
CREATE TABLE [dbo].[ref_department] (
    [DeptCode] VARCHAR(10) NOT NULL,
    [DeptName] NVARCHAR(100) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [ref_department_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_ref_department] PRIMARY KEY CLUSTERED ([DeptCode])
);

-- CreateTable
CREATE TABLE [dbo].[ref_position] (
    [PositionCode] VARCHAR(10) NOT NULL,
    [PositionName] NVARCHAR(100) NOT NULL,
    [PositionAllowance] DECIMAL(10,2) NOT NULL CONSTRAINT [ref_position_PositionAllowance_df] DEFAULT 0,
    [IsActive] BIT NOT NULL CONSTRAINT [ref_position_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_ref_position] PRIMARY KEY CLUSTERED ([PositionCode])
);

-- CreateTable
CREATE TABLE [dbo].[ref_bank] (
    [BankCode] VARCHAR(10) NOT NULL,
    [BankNameTH] NVARCHAR(100) NOT NULL,
    [BankNameEN] NVARCHAR(100) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [ref_bank_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_ref_bank] PRIMARY KEY CLUSTERED ([BankCode])
);

-- CreateTable
CREATE TABLE [dbo].[ref_sso_base] (
    [SSOBaseID] INT NOT NULL IDENTITY(1,1),
    [EffectiveYear] SMALLINT NOT NULL,
    [MinBase] DECIMAL(10,2) NOT NULL,
    [MaxBase] DECIMAL(10,2) NOT NULL,
    [EmployeeRate] DECIMAL(5,4) NOT NULL,
    [EmployerRate] DECIMAL(5,4) NOT NULL,
    CONSTRAINT [PK_ref_sso_base] PRIMARY KEY CLUSTERED ([SSOBaseID])
);

-- CreateTable
CREATE TABLE [dbo].[ref_black_list] (
    [BlackListID] INT NOT NULL IDENTITY(1,1),
    [IDCardNo] VARCHAR(20) NOT NULL,
    [FullName] NVARCHAR(150) NOT NULL,
    [Reason] NVARCHAR(300),
    [AddedDate] DATETIME NOT NULL CONSTRAINT [ref_black_list_AddedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_ref_black_list] PRIMARY KEY CLUSTERED ([BlackListID])
);

-- CreateTable
CREATE TABLE [dbo].[ref_tax_bracket] (
    [BracketID] INT NOT NULL IDENTITY(1,1),
    [EffectiveYear] SMALLINT NOT NULL,
    [IncomeFrom] DECIMAL(12,2) NOT NULL,
    [IncomeTo] DECIMAL(12,2) NOT NULL,
    [TaxRate] DECIMAL(5,4) NOT NULL,
    CONSTRAINT [PK_ref_tax_bracket] PRIMARY KEY CLUSTERED ([BracketID])
);

-- CreateTable
CREATE TABLE [dbo].[ref_deduction_rate] (
    [DeductionCode] VARCHAR(20) NOT NULL,
    [DeductionName] NVARCHAR(100) NOT NULL,
    [MaxAmount] DECIMAL(12,2) NOT NULL,
    [EffectiveYear] SMALLINT NOT NULL,
    CONSTRAINT [PK_ref_deduction_rate] PRIMARY KEY CLUSTERED ([DeductionCode])
);

-- CreateTable
CREATE TABLE [dbo].[sys_menu] (
    [DocumentType] VARCHAR(20) NOT NULL,
    [MenuNameTH] NVARCHAR(100) NOT NULL,
    [MenuNameEN] NVARCHAR(100) NOT NULL,
    [ModuleGroup] VARCHAR(30) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [sys_menu_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_sys_menu] PRIMARY KEY CLUSTERED ([DocumentType])
);

-- CreateTable
CREATE TABLE [dbo].[sys_user] (
    [UserID] VARCHAR(20) NOT NULL,
    [PasswordHash] VARCHAR(255) NOT NULL,
    [DisplayName] NVARCHAR(100) NOT NULL,
    [Email] NVARCHAR(100),
    [Role] VARCHAR(20) NOT NULL,
    [DefaultSiteCode] VARCHAR(10),
    [IsActive] BIT NOT NULL CONSTRAINT [sys_user_IsActive_df] DEFAULT 1,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [sys_user_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [LastLoginDate] DATETIME,
    CONSTRAINT [PK_sys_user] PRIMARY KEY CLUSTERED ([UserID])
);

-- CreateTable
CREATE TABLE [dbo].[sys_user_permission] (
    [PermissionID] INT NOT NULL IDENTITY(1,1),
    [UserID] VARCHAR(20) NOT NULL,
    [DocumentType] VARCHAR(20) NOT NULL,
    [SiteCode] VARCHAR(10),
    [CanRead] BIT NOT NULL CONSTRAINT [sys_user_permission_CanRead_df] DEFAULT 0,
    [CanSave] BIT NOT NULL CONSTRAINT [sys_user_permission_CanSave_df] DEFAULT 0,
    [CanDelete] BIT NOT NULL CONSTRAINT [sys_user_permission_CanDelete_df] DEFAULT 0,
    [CanApprove] BIT NOT NULL CONSTRAINT [sys_user_permission_CanApprove_df] DEFAULT 0,
    CONSTRAINT [PK_sys_user_permission] PRIMARY KEY CLUSTERED ([PermissionID]),
    CONSTRAINT [UQ_sys_user_permission] UNIQUE NONCLUSTERED ([UserID],[DocumentType],[SiteCode])
);

-- CreateTable
CREATE TABLE [dbo].[sys_period] (
    [PeriodID] INT NOT NULL IDENTITY(1,1),
    [EmployeeType] VARCHAR(20) NOT NULL,
    [PeriodYear] SMALLINT NOT NULL,
    [PeriodMonth] TINYINT NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [PayDate] DATE NOT NULL,
    [Status] VARCHAR(10) NOT NULL CONSTRAINT [sys_period_Status_df] DEFAULT 'OPEN',
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [sys_period_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_sys_period] PRIMARY KEY CLUSTERED ([PeriodID])
);

-- CreateTable
CREATE TABLE [dbo].[sys_process_log] (
    [LogID] BIGINT NOT NULL IDENTITY(1,1),
    [UserID] VARCHAR(20) NOT NULL,
    [ActionType] VARCHAR(50) NOT NULL,
    [TargetTable] VARCHAR(50),
    [TargetID] VARCHAR(50),
    [ActionDate] DATETIME NOT NULL CONSTRAINT [sys_process_log_ActionDate_df] DEFAULT CURRENT_TIMESTAMP,
    [Detail] NVARCHAR(500),
    CONSTRAINT [PK_sys_process_log] PRIMARY KEY CLUSTERED ([LogID])
);

-- CreateTable
CREATE TABLE [dbo].[sys_session] (
    [SessionID] VARCHAR(64) NOT NULL,
    [UserID] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [sys_session_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [LastActivityDate] DATETIME NOT NULL CONSTRAINT [sys_session_LastActivityDate_df] DEFAULT CURRENT_TIMESTAMP,
    [ExpiresDate] DATETIME NOT NULL,
    [IPAddress] VARCHAR(45),
    [UserAgent] NVARCHAR(255),
    [IsRevoked] BIT NOT NULL CONSTRAINT [sys_session_IsRevoked_df] DEFAULT 0,
    CONSTRAINT [PK_sys_session] PRIMARY KEY CLUSTERED ([SessionID])
);

-- CreateTable
CREATE TABLE [dbo].[mst_employee] (
    [EmpCode] VARCHAR(15) NOT NULL,
    [IDCardNo] VARCHAR(20) NOT NULL,
    [FullName] NVARCHAR(150) NOT NULL,
    [Address] NVARCHAR(300),
    [EmployeeStatus] VARCHAR(10) NOT NULL CONSTRAINT [mst_employee_EmployeeStatus_df] DEFAULT 'ACTIVE',
    [StartDate] DATE NOT NULL,
    [ResignDate] DATE,
    [DeptCode] VARCHAR(10),
    [PositionCode] VARCHAR(10),
    [DefaultSiteCode] VARCHAR(10),
    [EmployeeType] VARCHAR(20) NOT NULL,
    [BankCode] VARCHAR(10),
    [BankAccountNo] VARCHAR(20),
    [DailyRate] DECIMAL(10,2),
    [PhotoPath] NVARCHAR(255),
    [IsActive] BIT NOT NULL CONSTRAINT [mst_employee_IsActive_df] DEFAULT 1,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [mst_employee_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_mst_employee] PRIMARY KEY CLUSTERED ([EmpCode]),
    CONSTRAINT [UQ_mst_employee_IDCardNo] UNIQUE NONCLUSTERED ([IDCardNo])
);

-- CreateTable
CREATE TABLE [dbo].[mst_employee_quota] (
    [QuotaID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [QuotaType] VARCHAR(15) NOT NULL,
    [QuotaLimit] DECIMAL(12,2) NOT NULL CONSTRAINT [mst_employee_quota_QuotaLimit_df] DEFAULT 0,
    [QuotaUsed] DECIMAL(12,2) NOT NULL CONSTRAINT [mst_employee_quota_QuotaUsed_df] DEFAULT 0,
    [QuotaRemaining] DECIMAL(12,2) NOT NULL CONSTRAINT [mst_employee_quota_QuotaRemaining_df] DEFAULT 0,
    CONSTRAINT [PK_mst_employee_quota] PRIMARY KEY CLUSTERED ([QuotaID]),
    CONSTRAINT [UQ_mst_employee_quota] UNIQUE NONCLUSTERED ([EmpCode],[QuotaType])
);

-- CreateTable
CREATE TABLE [dbo].[mst_employee_history] (
    [HistoryID] BIGINT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [MemoType] VARCHAR(10) NOT NULL,
    [MemoText] NVARCHAR(1000) NOT NULL,
    [RecordedBy] VARCHAR(20) NOT NULL,
    [RecordedDate] DATETIME NOT NULL CONSTRAINT [mst_employee_history_RecordedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_mst_employee_history] PRIMARY KEY CLUSTERED ([HistoryID])
);

-- CreateTable
CREATE TABLE [dbo].[trn_request] (
    [RequestID] INT NOT NULL IDENTITY(1,1),
    [RequestType] VARCHAR(10) NOT NULL,
    [EmpCode] VARCHAR(15) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    [DeductPerPeriod] DECIMAL(12,2) NOT NULL,
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [trn_request_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [trn_request_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    CONSTRAINT [PK_trn_request] PRIMARY KEY CLUSTERED ([RequestID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_supplier] (
    [SupplierCode] VARCHAR(15) NOT NULL,
    [SupplierName] NVARCHAR(150) NOT NULL,
    [Address] NVARCHAR(300),
    [ContactPhone] VARCHAR(20),
    [IsActive] BIT NOT NULL CONSTRAINT [inv_supplier_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_inv_supplier] PRIMARY KEY CLUSTERED ([SupplierCode])
);

-- CreateTable
CREATE TABLE [dbo].[inv_warehouse] (
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [WarehouseName] NVARCHAR(150) NOT NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [inv_warehouse_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_inv_warehouse] PRIMARY KEY CLUSTERED ([WarehouseCode])
);

-- CreateTable
CREATE TABLE [dbo].[inv_product] (
    [ProductCode] VARCHAR(15) NOT NULL,
    [ProductName] NVARCHAR(150) NOT NULL,
    [Category] VARCHAR(30),
    [UnitCost] DECIMAL(10,2) NOT NULL CONSTRAINT [inv_product_UnitCost_df] DEFAULT 0,
    [UnitPrice] DECIMAL(10,2) NOT NULL CONSTRAINT [inv_product_UnitPrice_df] DEFAULT 0,
    [IsActive] BIT NOT NULL CONSTRAINT [inv_product_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_inv_product] PRIMARY KEY CLUSTERED ([ProductCode])
);

-- CreateTable
CREATE TABLE [dbo].[inv_stock_movement] (
    [MovementID] INT NOT NULL IDENTITY(1,1),
    [MovementType] VARCHAR(15) NOT NULL,
    [WarehouseCode] VARCHAR(10) NOT NULL,
    [TargetWarehouseCode] VARCHAR(10),
    [SupplierCode] VARCHAR(15),
    [EmpCode] VARCHAR(15),
    [MovementDate] DATE NOT NULL,
    [Status] VARCHAR(10) NOT NULL CONSTRAINT [inv_stock_movement_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [inv_stock_movement_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_inv_stock_movement] PRIMARY KEY CLUSTERED ([MovementID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_stock_movement_detail] (
    [DetailID] INT NOT NULL IDENTITY(1,1),
    [MovementID] INT NOT NULL,
    [ProductCode] VARCHAR(15) NOT NULL,
    [Qty] DECIMAL(10,2) NOT NULL,
    [UnitPrice] DECIMAL(10,2) NOT NULL,
    [Amount] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [PK_inv_stock_movement_detail] PRIMARY KEY CLUSTERED ([DetailID])
);

-- CreateTable
CREATE TABLE [dbo].[inv_employee_debt] (
    [DebtID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [MovementID] INT NOT NULL,
    [TotalAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [inv_employee_debt_TotalAmount_df] DEFAULT 0,
    [PaidAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [inv_employee_debt_PaidAmount_df] DEFAULT 0,
    [RemainingAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [inv_employee_debt_RemainingAmount_df] DEFAULT 0,
    [Status] VARCHAR(10) NOT NULL CONSTRAINT [inv_employee_debt_Status_df] DEFAULT 'OPEN',
    CONSTRAINT [PK_inv_employee_debt] PRIMARY KEY CLUSTERED ([DebtID])
);

-- CreateTable
CREATE TABLE [dbo].[mst_attendance_code] (
    [Code] VARCHAR(3) NOT NULL,
    [CodeNameTH] NVARCHAR(50) NOT NULL,
    [CodeNameEN] NVARCHAR(50) NOT NULL,
    [PayMultiplier] DECIMAL(3,1) NOT NULL CONSTRAINT [mst_attendance_code_PayMultiplier_df] DEFAULT 1.0,
    [SortOrder] TINYINT NOT NULL CONSTRAINT [mst_attendance_code_SortOrder_df] DEFAULT 0,
    [IsActive] BIT NOT NULL CONSTRAINT [mst_attendance_code_IsActive_df] DEFAULT 1,
    CONSTRAINT [PK_mst_attendance_code] PRIMARY KEY CLUSTERED ([Code])
);

-- CreateTable
CREATE TABLE [dbo].[trn_worksheet_header] (
    [WorksheetID] INT NOT NULL IDENTITY(1,1),
    [SiteCode] VARCHAR(10) NOT NULL,
    [WorkYear] SMALLINT NOT NULL,
    [WorkMonth] TINYINT NOT NULL,
    [Status] VARCHAR(20) NOT NULL CONSTRAINT [trn_worksheet_header_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [trn_worksheet_header_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [SubmittedBy] VARCHAR(20),
    [SubmittedDate] DATETIME,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    [RejectedBy] VARCHAR(20),
    [RejectedDate] DATETIME,
    [RejectReason] NVARCHAR(300),
    [RowVer] rowversion NOT NULL,
    CONSTRAINT [PK_trn_worksheet_header] PRIMARY KEY CLUSTERED ([WorksheetID]),
    CONSTRAINT [UQ_trn_worksheet_header] UNIQUE NONCLUSTERED ([SiteCode],[WorkYear],[WorkMonth])
);

-- CreateTable
CREATE TABLE [dbo].[trn_worksheet_detail] (
    [WorksheetDetailID] INT NOT NULL IDENTITY(1,1),
    [WorksheetID] INT NOT NULL,
    [EmpCode] VARCHAR(15) NOT NULL,
    [EmpType] VARCHAR(10) NOT NULL CONSTRAINT [trn_worksheet_detail_EmpType_df] DEFAULT 'REGULAR',
    [DailyRate] DECIMAL(10,2) NOT NULL,
    [DisplayOrder] SMALLINT NOT NULL CONSTRAINT [trn_worksheet_detail_DisplayOrder_df] DEFAULT 0,
    [RowVer] rowversion NOT NULL,
    CONSTRAINT [PK_trn_worksheet_detail] PRIMARY KEY CLUSTERED ([WorksheetDetailID]),
    CONSTRAINT [UQ_trn_worksheet_detail] UNIQUE NONCLUSTERED ([WorksheetID],[EmpCode])
);

-- CreateTable
CREATE TABLE [dbo].[trn_worksheet_daily] (
    [WorksheetDailyID] INT NOT NULL IDENTITY(1,1),
    [WorksheetDetailID] INT NOT NULL,
    [WorkDate] DATE NOT NULL,
    [AttendCode] VARCHAR(3),
    [Remark] NVARCHAR(200),
    [UpdatedBy] VARCHAR(20) NOT NULL,
    [UpdatedDate] DATETIME NOT NULL CONSTRAINT [trn_worksheet_daily_UpdatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_trn_worksheet_daily] PRIMARY KEY CLUSTERED ([WorksheetDailyID]),
    CONSTRAINT [UQ_trn_worksheet_daily] UNIQUE NONCLUSTERED ([WorksheetDetailID],[WorkDate])
);

-- CreateTable
CREATE TABLE [dbo].[trn_payroll_transaction] (
    [TransactionID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [PeriodID] INT NOT NULL,
    [SiteCode] VARCHAR(10) NOT NULL,
    [WorkDays] DECIMAL(5,2) NOT NULL CONSTRAINT [trn_payroll_transaction_WorkDays_df] DEFAULT 0,
    [DoubleShiftDays] DECIMAL(5,2) NOT NULL CONSTRAINT [trn_payroll_transaction_DoubleShiftDays_df] DEFAULT 0,
    [HolidayDays] DECIMAL(5,2) NOT NULL CONSTRAINT [trn_payroll_transaction_HolidayDays_df] DEFAULT 0,
    [OTHours] DECIMAL(6,2) NOT NULL CONSTRAINT [trn_payroll_transaction_OTHours_df] DEFAULT 0,
    [OTAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_OTAmount_df] DEFAULT 0,
    [PositionAllowance] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_PositionAllowance_df] DEFAULT 0,
    [ShiftAllowance] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_ShiftAllowance_df] DEFAULT 0,
    [AdvanceDeduct] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_AdvanceDeduct_df] DEFAULT 0,
    [LoanDeduct] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_LoanDeduct_df] DEFAULT 0,
    [TrainingDeduct] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_TrainingDeduct_df] DEFAULT 0,
    [UniformDeduct] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_UniformDeduct_df] DEFAULT 0,
    [GrossWage] DECIMAL(12,2) NOT NULL CONSTRAINT [trn_payroll_transaction_GrossWage_df] DEFAULT 0,
    [TaxWithheld] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_TaxWithheld_df] DEFAULT 0,
    [SSOAmount] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_SSOAmount_df] DEFAULT 0,
    [OtherIncome] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_OtherIncome_df] DEFAULT 0,
    [OtherDeduction] DECIMAL(10,2) NOT NULL CONSTRAINT [trn_payroll_transaction_OtherDeduction_df] DEFAULT 0,
    [NetPay] DECIMAL(12,2) NOT NULL CONSTRAINT [trn_payroll_transaction_NetPay_df] DEFAULT 0,
    [SourceWorksheetID] INT,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [trn_payroll_transaction_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PK_trn_payroll_transaction] PRIMARY KEY CLUSTERED ([TransactionID]),
    CONSTRAINT [UQ_trn_payroll_transaction] UNIQUE NONCLUSTERED ([EmpCode],[PeriodID])
);

-- CreateTable
CREATE TABLE [dbo].[trn_payroll_calculate_log] (
    [LogID] INT NOT NULL IDENTITY(1,1),
    [PeriodID] INT NOT NULL,
    [EmployeeType] VARCHAR(20) NOT NULL,
    [CalculatedBy] VARCHAR(20) NOT NULL,
    [CalculatedDate] DATETIME NOT NULL CONSTRAINT [trn_payroll_calculate_log_CalculatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [Status] VARCHAR(10) NOT NULL,
    [EmployeeCount] INT NOT NULL CONSTRAINT [trn_payroll_calculate_log_EmployeeCount_df] DEFAULT 0,
    [TotalAmount] DECIMAL(14,2) NOT NULL CONSTRAINT [trn_payroll_calculate_log_TotalAmount_df] DEFAULT 0,
    CONSTRAINT [PK_trn_payroll_calculate_log] PRIMARY KEY CLUSTERED ([LogID])
);

-- CreateTable
CREATE TABLE [dbo].[trn_payroll_lock] (
    [LockID] INT NOT NULL IDENTITY(1,1),
    [PeriodID] INT NOT NULL,
    [IsLocked] BIT NOT NULL CONSTRAINT [trn_payroll_lock_IsLocked_df] DEFAULT 0,
    [LockedBy] VARCHAR(20),
    [LockedDate] DATETIME,
    CONSTRAINT [PK_trn_payroll_lock] PRIMARY KEY CLUSTERED ([LockID])
);

-- CreateTable
CREATE TABLE [dbo].[mst_leave_type] (
    [LeaveTypeCode] VARCHAR(10) NOT NULL,
    [LeaveTypeName] NVARCHAR(100) NOT NULL,
    [MaxDaysPerYear] TINYINT NOT NULL,
    [RequireMedicalCert] BIT NOT NULL CONSTRAINT [mst_leave_type_RequireMedicalCert_df] DEFAULT 0,
    CONSTRAINT [PK_mst_leave_type] PRIMARY KEY CLUSTERED ([LeaveTypeCode])
);

-- CreateTable
CREATE TABLE [dbo].[trn_leave_request] (
    [LeaveID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [LeaveTypeCode] VARCHAR(10) NOT NULL,
    [StartDate] DATE NOT NULL,
    [EndDate] DATE NOT NULL,
    [TotalDays] DECIMAL(4,1) NOT NULL,
    [HasMedicalCert] BIT NOT NULL CONSTRAINT [trn_leave_request_HasMedicalCert_df] DEFAULT 0,
    [Status] VARCHAR(15) NOT NULL CONSTRAINT [trn_leave_request_Status_df] DEFAULT 'DRAFT',
    [CreatedBy] VARCHAR(20) NOT NULL,
    [CreatedDate] DATETIME NOT NULL CONSTRAINT [trn_leave_request_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
    [ApprovedBy] VARCHAR(20),
    [ApprovedDate] DATETIME,
    CONSTRAINT [PK_trn_leave_request] PRIMARY KEY CLUSTERED ([LeaveID])
);

-- CreateTable
CREATE TABLE [dbo].[mst_employee_leave_balance] (
    [BalanceID] INT NOT NULL IDENTITY(1,1),
    [EmpCode] VARCHAR(15) NOT NULL,
    [LeaveTypeCode] VARCHAR(10) NOT NULL,
    [Year] SMALLINT NOT NULL,
    [Entitled] DECIMAL(4,1) NOT NULL CONSTRAINT [mst_employee_leave_balance_Entitled_df] DEFAULT 0,
    [Used] DECIMAL(4,1) NOT NULL CONSTRAINT [mst_employee_leave_balance_Used_df] DEFAULT 0,
    [Remaining] DECIMAL(4,1) NOT NULL CONSTRAINT [mst_employee_leave_balance_Remaining_df] DEFAULT 0,
    CONSTRAINT [PK_mst_employee_leave_balance] PRIMARY KEY CLUSTERED ([BalanceID]),
    CONSTRAINT [UQ_mst_employee_leave_balance] UNIQUE NONCLUSTERED ([EmpCode],[LeaveTypeCode],[Year])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_sys_process_log_ActionDate] ON [dbo].[sys_process_log]([ActionDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_sys_session_UserID] ON [dbo].[sys_session]([UserID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_sys_session_ExpiresDate] ON [dbo].[sys_session]([ExpiresDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_mst_employee_DeptCode] ON [dbo].[mst_employee]([DeptCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_trn_request_EmpCode] ON [dbo].[trn_request]([EmpCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_inv_stock_movement_detail_MovementID] ON [dbo].[inv_stock_movement_detail]([MovementID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_trn_worksheet_daily_WorksheetDetailID] ON [dbo].[trn_worksheet_daily]([WorksheetDetailID]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IX_trn_payroll_transaction_Period_Site] ON [dbo].[trn_payroll_transaction]([PeriodID], [SiteCode]);

-- CheckConstraints (not expressible in Prisma schema syntax — added by hand to
-- match HFC_System_Database_DDL.sql exactly)
ALTER TABLE [dbo].[sys_user] ADD CONSTRAINT [CK_sys_user_Role] CHECK ([Role] IN ('SITE_HEAD','APPROVER','ADMIN','PAYROLL','HR','STORE'));
ALTER TABLE [dbo].[sys_period] ADD CONSTRAINT [CK_sys_period_Status] CHECK ([Status] IN ('OPEN','CLOSED'));
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [CK_mst_employee_Status] CHECK ([EmployeeStatus] IN ('ACTIVE','RESIGNED'));
ALTER TABLE [dbo].[mst_employee_quota] ADD CONSTRAINT [CK_mst_employee_quota_Type] CHECK ([QuotaType] IN ('ADVANCE','LOAN','UNIFORM','SERVICE','INSURANCE'));
ALTER TABLE [dbo].[mst_employee_history] ADD CONSTRAINT [CK_mst_employee_history_MemoType] CHECK ([MemoType] IN ('GENERAL','ADMIN','FINANCE'));
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [CK_trn_request_Type] CHECK ([RequestType] IN ('ADVANCE','LOAN','TRAINING'));
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [CK_trn_request_Status] CHECK ([Status] IN ('DRAFT','SUBMITTED','APPROVED','REJECTED'));
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [CK_inv_stock_movement_Type] CHECK ([MovementType] IN ('ADJUST','PURCHASE','TRANSFER','ISSUE','RETURN'));
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [CK_inv_stock_movement_Status] CHECK ([Status] IN ('DRAFT','CONFIRMED'));
ALTER TABLE [dbo].[inv_employee_debt] ADD CONSTRAINT [CK_inv_employee_debt_Status] CHECK ([Status] IN ('OPEN','CLOSED'));
ALTER TABLE [dbo].[trn_worksheet_header] ADD CONSTRAINT [CK_trn_worksheet_header_Status] CHECK ([Status] IN ('DRAFT','SUBMITTED','APPROVED','REJECTED'));
ALTER TABLE [dbo].[trn_payroll_calculate_log] ADD CONSTRAINT [CK_trn_payroll_calculate_log_Status] CHECK ([Status] IN ('SUCCESS','CANCELLED'));
ALTER TABLE [dbo].[trn_leave_request] ADD CONSTRAINT [CK_trn_leave_request_Status] CHECK ([Status] IN ('DRAFT','SUBMITTED','APPROVED','REJECTED'));

-- AddForeignKey
ALTER TABLE [dbo].[sys_user] ADD CONSTRAINT [FK_sys_user_mst_site] FOREIGN KEY ([DefaultSiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_permission] ADD CONSTRAINT [FK_sys_user_permission_sys_menu] FOREIGN KEY ([DocumentType]) REFERENCES [dbo].[sys_menu]([DocumentType]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_permission] ADD CONSTRAINT [FK_sys_user_permission_sys_user] FOREIGN KEY ([UserID]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_user_permission] ADD CONSTRAINT [FK_sys_user_permission_mst_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_process_log] ADD CONSTRAINT [FK_sys_process_log_sys_user] FOREIGN KEY ([UserID]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sys_session] ADD CONSTRAINT [FK_sys_session_sys_user] FOREIGN KEY ([UserID]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [FK_mst_employee_ref_department] FOREIGN KEY ([DeptCode]) REFERENCES [dbo].[ref_department]([DeptCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [FK_mst_employee_ref_position] FOREIGN KEY ([PositionCode]) REFERENCES [dbo].[ref_position]([PositionCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [FK_mst_employee_mst_site] FOREIGN KEY ([DefaultSiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee] ADD CONSTRAINT [FK_mst_employee_ref_bank] FOREIGN KEY ([BankCode]) REFERENCES [dbo].[ref_bank]([BankCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_quota] ADD CONSTRAINT [FK_mst_employee_quota_mst_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_history] ADD CONSTRAINT [FK_mst_employee_history_mst_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_history] ADD CONSTRAINT [FK_mst_employee_history_sys_user] FOREIGN KEY ([RecordedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [FK_trn_request_mst_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [FK_trn_request_sys_user_created] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [FK_trn_request_sys_user_approved] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_request] ADD CONSTRAINT [FK_trn_request_sys_user_rejected] FOREIGN KEY ([RejectedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [FK_inv_stock_movement_warehouse] FOREIGN KEY ([WarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [FK_inv_stock_movement_target_warehouse] FOREIGN KEY ([TargetWarehouseCode]) REFERENCES [dbo].[inv_warehouse]([WarehouseCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [FK_inv_stock_movement_supplier] FOREIGN KEY ([SupplierCode]) REFERENCES [dbo].[inv_supplier]([SupplierCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [FK_inv_stock_movement_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement] ADD CONSTRAINT [FK_inv_stock_movement_sys_user] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement_detail] ADD CONSTRAINT [FK_inv_stock_movement_detail_movement] FOREIGN KEY ([MovementID]) REFERENCES [dbo].[inv_stock_movement]([MovementID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_stock_movement_detail] ADD CONSTRAINT [FK_inv_stock_movement_detail_product] FOREIGN KEY ([ProductCode]) REFERENCES [dbo].[inv_product]([ProductCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt] ADD CONSTRAINT [FK_inv_employee_debt_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[inv_employee_debt] ADD CONSTRAINT [FK_inv_employee_debt_movement] FOREIGN KEY ([MovementID]) REFERENCES [dbo].[inv_stock_movement]([MovementID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_header] ADD CONSTRAINT [FK_trn_worksheet_header_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_header] ADD CONSTRAINT [FK_trn_worksheet_header_created_by] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_detail] ADD CONSTRAINT [FK_trn_worksheet_detail_header] FOREIGN KEY ([WorksheetID]) REFERENCES [dbo].[trn_worksheet_header]([WorksheetID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_detail] ADD CONSTRAINT [FK_trn_worksheet_detail_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_daily] ADD CONSTRAINT [FK_trn_worksheet_daily_detail] FOREIGN KEY ([WorksheetDetailID]) REFERENCES [dbo].[trn_worksheet_detail]([WorksheetDetailID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_worksheet_daily] ADD CONSTRAINT [FK_trn_worksheet_daily_attend_code] FOREIGN KEY ([AttendCode]) REFERENCES [dbo].[mst_attendance_code]([Code]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction] ADD CONSTRAINT [FK_trn_payroll_transaction_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction] ADD CONSTRAINT [FK_trn_payroll_transaction_period] FOREIGN KEY ([PeriodID]) REFERENCES [dbo].[sys_period]([PeriodID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction] ADD CONSTRAINT [FK_trn_payroll_transaction_site] FOREIGN KEY ([SiteCode]) REFERENCES [dbo].[mst_site]([SiteCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_transaction] ADD CONSTRAINT [FK_trn_payroll_transaction_worksheet] FOREIGN KEY ([SourceWorksheetID]) REFERENCES [dbo].[trn_worksheet_header]([WorksheetID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_calculate_log] ADD CONSTRAINT [FK_trn_payroll_calculate_log_period] FOREIGN KEY ([PeriodID]) REFERENCES [dbo].[sys_period]([PeriodID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_calculate_log] ADD CONSTRAINT [FK_trn_payroll_calculate_log_user] FOREIGN KEY ([CalculatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_lock] ADD CONSTRAINT [FK_trn_payroll_lock_period] FOREIGN KEY ([PeriodID]) REFERENCES [dbo].[sys_period]([PeriodID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_payroll_lock] ADD CONSTRAINT [FK_trn_payroll_lock_user] FOREIGN KEY ([LockedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_leave_request] ADD CONSTRAINT [FK_trn_leave_request_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_leave_request] ADD CONSTRAINT [FK_trn_leave_request_type] FOREIGN KEY ([LeaveTypeCode]) REFERENCES [dbo].[mst_leave_type]([LeaveTypeCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_leave_request] ADD CONSTRAINT [FK_trn_leave_request_created_by] FOREIGN KEY ([CreatedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[trn_leave_request] ADD CONSTRAINT [FK_trn_leave_request_approved_by] FOREIGN KEY ([ApprovedBy]) REFERENCES [dbo].[sys_user]([UserID]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_leave_balance] ADD CONSTRAINT [FK_mst_employee_leave_balance_employee] FOREIGN KEY ([EmpCode]) REFERENCES [dbo].[mst_employee]([EmpCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[mst_employee_leave_balance] ADD CONSTRAINT [FK_mst_employee_leave_balance_type] FOREIGN KEY ([LeaveTypeCode]) REFERENCES [dbo].[mst_leave_type]([LeaveTypeCode]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

