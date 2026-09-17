BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[inv_employee_debt] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [inv_employee_debt_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[inv_product] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [inv_product_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[inv_stock_movement] ADD [UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[inv_stock_movement_detail] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [inv_stock_movement_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[inv_supplier] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [inv_supplier_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[inv_warehouse] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [inv_warehouse_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_attendance_code] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_attendance_code_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [CreatedBy] VARCHAR(20),
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_employee_history] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_employee_history_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_employee_leave_balance] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_employee_leave_balance_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_employee_quota] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_employee_quota_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_leave_type] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_leave_type_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[mst_site] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [mst_site_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_bank] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_bank_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_black_list] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_black_list_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_company] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_company_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_deduction_rate] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_deduction_rate_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_department] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_department_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_position] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_position_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_sso_base] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_sso_base_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[ref_tax_bracket] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [ref_tax_bracket_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_menu] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [sys_menu_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_period] ADD [CreatedBy] VARCHAR(20),
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_process_log] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [sys_process_log_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_session] ADD [CreatedBy] VARCHAR(20),
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_user] ADD [CreatedBy] VARCHAR(20),
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[sys_user_permission] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [sys_user_permission_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_leave_request] ADD [UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_calculate_log] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [trn_payroll_calculate_log_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_lock] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [trn_payroll_lock_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_payroll_transaction] ADD [CreatedBy] VARCHAR(20),
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_request] ADD [UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_worksheet_daily] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [trn_worksheet_daily_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE [dbo].[trn_worksheet_detail] ADD [CreatedBy] VARCHAR(20),
[CreatedDate] DATETIME CONSTRAINT [trn_worksheet_detail_CreatedDate_df] DEFAULT CURRENT_TIMESTAMP,
[UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

-- AlterTable
ALTER TABLE [dbo].[trn_worksheet_header] ADD [UpdatedBy] VARCHAR(20),
[UpdatedDate] DATETIME;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
