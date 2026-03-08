import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/maintenance") return NextResponse.next();
  if (pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname.startsWith("/api")) return NextResponse.next();

  const maintenance = request.cookies.get("sis-maintenance")?.value;
  if (maintenance === "true") {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
