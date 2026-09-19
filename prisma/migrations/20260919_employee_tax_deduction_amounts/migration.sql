BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD [DonationAmount] DECIMAL(12,2),
[HealthInsurancePremium] DECIMAL(12,2),
[HomeLoanInterestAmount] DECIMAL(12,2),
[LifeInsurancePremium] DECIMAL(12,2),
[ParentHealthInsurancePremium] DECIMAL(12,2),
[ParentSupportAmount] DECIMAL(12,2),
[RMFPurchaseAmount] DECIMAL(12,2);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
