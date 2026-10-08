-- Company flag: auto-post MOBILE check-in/out to Worksheet
ALTER TABLE [dbo].[ref_company] ADD [AutoTimeToWorksheet] BIT NOT NULL CONSTRAINT [DF_ref_company_AutoTimeToWorksheet] DEFAULT 0;

-- N-D = night shift continuing into the next morning's day shift, recorded on
-- the check-in date. Counts as a double shift (PayMultiplier 2.0) like D-N.
INSERT INTO [dbo].[mst_attendance_code] ([Code],[CodeNameTH],[CodeNameEN],[PayMultiplier],[SortOrder],[IsActive])
SELECT 'N-D', N'ควบ 2 กะ (ดึก-เช้า)', N'Night-Day Double Shift', 2.0, 5, 1
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[mst_attendance_code] WHERE [Code] = 'N-D');
