-- At most ONE open (not yet checked-out) shift per employee, enforced by the
-- database so two near-simultaneous CHECK-IN taps can't both succeed. A
-- filtered unique index (Prisma can't model these — raw SQL only).
CREATE UNIQUE NONCLUSTERED INDEX [UX_trn_attendance_log_one_open_per_emp]
ON [dbo].[trn_attendance_log]([EmpCode])
WHERE [CheckOutTime] IS NULL;
