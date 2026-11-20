import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/roles";
import { signOutAction } from "@/actions/auth";
import { Building2, LogOut } from "lucide-react";
import Link from "next/link";

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const isTenant = context.memberships.some((m) => m.role === "tenant");
  if (!isTenant) {
    redirect("/unauthorized");
  }

  const currentPg = context.primaryMembership;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md md:max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tenant" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold shadow-md shadow-purple-600/20">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 tracking-tight block leading-tight">
                  {currentPg.pg_name}
                </span>
                <span className="text-[10px] font-mono text-purple-700 font-semibold uppercase tracking-wider block">
                  Resident App
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <form action={signOutAction}>
              <button
                type="submit"
                className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 transition-all"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-md md:max-w-4xl w-full mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
