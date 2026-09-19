import { prisma } from "@/lib/prisma";
import LoginForm from "./login-form";

// This page reads no cookies/headers/searchParams, so Next would otherwise
// statically prerender it at build time and freeze companyShortName's value
// from then on — force it dynamic so edits made later via /reference show
// up without a rebuild, matching every other page in the app (all of which
// already go dynamic via verifySession()'s cookies() read).
export const dynamic = "force-dynamic";

// Same fallback used in src/app/(app)/layout.tsx's sidebar footer — keeps
// the two brand labels consistent even before a company row exists.
const DEFAULT_COMPANY_LABEL = "ABC CO., LTD.";

export default async function LoginPage() {
  const company = await prisma.refCompany.findFirst({ orderBy: { CompanyCode: "asc" } });
  const companyShortName = company?.ShortName || DEFAULT_COMPANY_LABEL;

  return <LoginForm companyShortName={companyShortName} />;
}
