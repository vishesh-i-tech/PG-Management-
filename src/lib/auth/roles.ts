import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database.types";

export interface ActiveMembership {
  id: string;
  pg_id: string;
  pg_name: string;
  pg_slug: string;
  role: MemberRole;
  status: "active" | "inactive" | "alumni";
}

export interface UserAuthContext {
  userId: string;
  phone: string | null;
  fullName: string | null;
  memberships: ActiveMembership[];
  primaryMembership: ActiveMembership | null;
}

/**
 * Retrieves the current authenticated user and their active PG memberships.
 * Returns null if not authenticated.
 */
export async function getAuthContext(): Promise<UserAuthContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  // Fetch or create user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  // Fetch active memberships joined with PG details
  const { data: memberRows } = await supabase
    .from("pg_members")
    .select(`
      id,
      pg_id,
      role,
      status,
      pgs (
        id,
        name,
        slug
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active");

  const memberships: ActiveMembership[] = (memberRows || []).map((row) => {
    // pgs can be an object or array in Supabase typed query
    const pg = Array.isArray(row.pgs) ? row.pgs[0] : row.pgs;
    return {
      id: row.id,
      pg_id: row.pg_id,
      pg_name: pg?.name || "Unknown PG",
      pg_slug: pg?.slug || "",
      role: row.role as MemberRole,
      status: row.status as "active" | "inactive" | "alumni",
    };
  });

  // Determine primary membership: owner > warden > tenant
  let primaryMembership: ActiveMembership | null = null;
  if (memberships.length > 0) {
    primaryMembership =
      memberships.find((m) => m.role === "owner") ||
      memberships.find((m) => m.role === "warden") ||
      memberships[0];
  }

  return {
    userId: user.id,
    phone: user.phone || profile?.phone || null,
    fullName: profile?.full_name || null,
    memberships,
    primaryMembership,
  };
}

/**
 * Checks if the authenticated user has access to a specific role.
 */
export async function verifyRoleAccess(requiredRole: MemberRole | MemberRole[]): Promise<{
  authorized: boolean;
  context: UserAuthContext | null;
}> {
  const context = await getAuthContext();
  if (!context || !context.primaryMembership) {
    return { authorized: false, context };
  }

  const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const authorized = context.memberships.some((m) => allowedRoles.includes(m.role));

  return { authorized, context };
}
