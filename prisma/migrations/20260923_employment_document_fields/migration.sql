BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[mst_employee] ADD
[AddressHouseNo] NVARCHAR(20),
[AddressMoo] NVARCHAR(10),
[AddressSoi] NVARCHAR(50),
[AddressRoad] NVARCHAR(50),
[AddressTambon] NVARCHAR(50),
[AddressAmphoe] NVARCHAR(50),
[AddressProvince] NVARCHAR(50),
[AddressZipCode] VARCHAR(10),
[ReferencePerson1Name] NVARCHAR(150),
[ReferencePerson2Name] NVARCHAR(150);

-- AlterTable
ALTER TABLE [dbo].[ref_company] ADD
[SecurityBusinessLicenseNo] VARCHAR(30),
[AuthorizedSignerName] NVARCHAR(150),
[AuthorizedSignerPosition] NVARCHAR(100),
[RegisteredDate] DATE,
[RegisteredProvince] NVARCHAR(50),
[AddressHouseNo] NVARCHAR(20),
[AddressFloor] NVARCHAR(20),
[AddressMoo] NVARCHAR(10),
[AddressSoi] NVARCHAR(50),
[AddressRoad] NVARCHAR(50),
[AddressTambon] NVARCHAR(50),
[AddressAmphoe] NVARCHAR(50),
[AddressProvince] NVARCHAR(50),
[AddressZipCode] VARCHAR(10);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
