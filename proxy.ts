import { NextRequest, NextResponse } from "next/server";
import { readOptimisticSession } from "@/lib/session";

// `middleware.ts` was renamed to `proxy.ts` in this Next.js version.
// This does an OPTIMISTIC check only (cookie decrypt, no DB hit) to redirect
// quickly — Route Handlers still do their own SECURE check via the DAL
// (verifySession) before trusting the session, per Next.js's auth guide.
const publicRoutes = ["/login"];

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublicRoute = publicRoutes.includes(path);

  const session = await readOptimisticSession();

  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
