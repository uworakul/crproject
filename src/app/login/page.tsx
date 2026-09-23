import LoginForm from "./login-form";

// This page can no longer look up a company name from the DB — login
// happens BEFORE a tenant is known (that's what the "รหัสลูกค้า" field on
// this form resolves), so there's no tenant context yet for `prisma` to use
// here. Show a static label instead; the tenant-specific company name
// still appears everywhere post-login (sidebar footer etc. via
// src/app/(app)/layout.tsx, which runs after verifySession() has resolved
// the tenant).
const DEFAULT_COMPANY_LABEL = "ComRider";

export default function LoginPage() {
  return <LoginForm companyShortName={DEFAULT_COMPANY_LABEL} />;
}
