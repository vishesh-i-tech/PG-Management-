import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const rawClient = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const supabase = rawClient as unknown as SupabaseClient<Database>;

  // Refresh auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isOwnerRoute = pathname.startsWith("/owner");
  const isWardenRoute = pathname.startsWith("/warden");
  const isTenantRoute = pathname.startsWith("/tenant");
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  const isAuthRoute = pathname.startsWith("/auth");

  // 1. Unauthenticated users attempting to access protected routes
  if ((isOwnerRoute || isWardenRoute || isTenantRoute || isOnboardingRoute) && !user) {
    const redirectUrl = new URL("/auth/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Authenticated users: verify role permissions if accessing protected routes
  if (user && (isOwnerRoute || isWardenRoute || isTenantRoute || isOnboardingRoute || isAuthRoute)) {
    // Query active memberships for this user
    const { data: memberships } = await supabase
      .from("pg_members")
      .select("role, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    const roles = (memberships || []).map((m) => m.role);
    const hasMembership = roles.length > 0;
    const isOwner = roles.includes("owner");
    const isWarden = roles.includes("warden") || isOwner;
    const isTenant = roles.includes("tenant");

    // Authenticated user at /auth/login -> redirect to appropriate portal or onboarding
    if (isAuthRoute) {
      if (!hasMembership) {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
      if (isOwner) return NextResponse.redirect(new URL("/owner", request.url));
      if (isWarden) return NextResponse.redirect(new URL("/warden", request.url));
      if (isTenant) return NextResponse.redirect(new URL("/tenant", request.url));
    }

    // Authenticated user with no active membership accessing dashboard
    if (!hasMembership && (isOwnerRoute || isWardenRoute || isTenantRoute)) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Authenticated user with membership attempting to revisit /onboarding
    if (hasMembership && isOnboardingRoute) {
      if (isOwner) return NextResponse.redirect(new URL("/owner", request.url));
      if (isWarden) return NextResponse.redirect(new URL("/warden", request.url));
      if (isTenant) return NextResponse.redirect(new URL("/tenant", request.url));
    }

    // Route-specific role authorization
    if (isOwnerRoute && !isOwner) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
    if (isWardenRoute && !isWarden) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
    if (isTenantRoute && !isTenant) {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.*|sw.js|workbox-.*|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
