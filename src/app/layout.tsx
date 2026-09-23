import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { getCurrentTenantClientOrNull } from "@/lib/tenant-context";
import "./globals.css";

// Matches the clean geometric-sans look of the reference screenshot's font.
const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
});

// Same fallback used in the sidebar footer and login page — keeps all three
// brand labels consistent even before a company row exists.
const DEFAULT_COMPANY_LABEL = "ComRider";

export async function generateMetadata(): Promise<Metadata> {
  // Runs for every route, including pre-login ones (no tenant resolved
  // yet) — only query if a tenant context already exists for this request.
  const client = getCurrentTenantClientOrNull();
  const company = client ? await client.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } }) : null;
  const companyShortName = company?.ShortName || DEFAULT_COMPANY_LABEL;
  return {
    title: `CRPAYROLL — ${companyShortName}`,
    description: `ระบบ HR & Payroll สำหรับ ${companyShortName}`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={prompt.variable}>
      <body>{children}</body>
    </html>
  );
}
