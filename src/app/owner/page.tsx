import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { OwnerDashboardClient } from "./OwnerDashboardClient";

export default async function OwnerPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  // Fetch full details of the active PG
  const { data: pg } = await supabase
    .from("pgs")
    .select("*")
    .eq("id", context.primaryMembership.pg_id)
    .single();

  if (!pg) {
    redirect("/onboarding");
  }

  return (
    <OwnerDashboardClient
      pg={pg}
      ownerName={context.fullName || "PG Owner"}
    />
  );
}
