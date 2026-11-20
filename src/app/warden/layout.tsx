import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/roles";
import { signOutAction } from "@/actions/auth";
import { Building2, ShieldCheck, LogOut } from "lucide-react";
import Link from "next/link";

export default async function WardenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const isWarden = context.memberships.some((m) => m.role === "warden" || m.role === "owner");
  if (!isWarden) {
    redirect("/unauthorized");
  }

  const currentPg = context.primaryMembership;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/warden" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-600/20">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 tracking-tight block leading-tight">
                  {currentPg.pg_name}
                </span>
                <span className="text-[10px] font-mono text-blue-700 font-semibold uppercase tracking-wider block">
                  Warden Operations
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Warden Access</span>
            </div>

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

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </div>
  );
}
