import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { 
  BedDouble, 
  CreditCard, 
  DoorOpen, 
  UtensilsCrossed, 
  AlertCircle, 
  Sparkles 
} from "lucide-react";

export default async function TenantPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  // Fetch tenant record for this user in this PG
  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("pg_id", context.primaryMembership.pg_id)
    .eq("user_id", context.userId)
    .single();

  const { data: pg } = await supabase
    .from("pgs")
    .select("*")
    .eq("id", context.primaryMembership.pg_id)
    .single();

  return (
    <div className="space-y-6">
      {/* Resident Identity Card */}
      <div className="bg-gradient-to-r from-purple-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-purple-900/10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold uppercase tracking-wider mb-2">
          <Sparkles className="w-3.5 h-3.5" /> Resident Portal
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          Hello, {tenant?.full_name || context.fullName || "Resident"}
        </h1>
        <p className="text-xs text-purple-200 mt-1">
          {pg?.name} • {pg?.city}
        </p>
      </div>

      {/* Quick Gate & Stay Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
            <DoorOpen className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Presence Status
          </span>
          <span className="text-base font-bold text-emerald-600 block mt-0.5">
            Inside Campus
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Gate Closes {pg?.gate_closing_time || "22:00:00"}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-2">
            <BedDouble className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Assigned Bed
          </span>
          <span className="text-base font-bold text-slate-800 block mt-0.5">
            {tenant ? "Room Active" : "Pending Alloc"}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 capitalize">
            {tenant?.status || "Active Resident"}
          </span>
        </div>
      </div>

      {/* Financial Status Banner (Phase 4 Preview) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Monthly Rent Ledger</h3>
              <p className="text-xs text-slate-500">Razorpay UPI &amp; Instant Receipts</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Up to Date
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Your rent bills, digital payment receipts, and security deposit ledger are tracked here with immutable accounting.
        </p>
      </div>

      {/* Services Grid (Phase 3 Modules) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h3 className="font-bold text-slate-900 text-sm mb-4">Resident Services</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 text-center">
            <UtensilsCrossed className="w-5 h-5 text-emerald-600 mx-auto mb-1.5" />
            <span className="font-bold text-xs text-slate-800 block">Today&apos;s Mess Menu</span>
            <span className="text-[10px] text-slate-400">Breakfast • Lunch • Dinner</span>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50 text-center">
            <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1.5" />
            <span className="font-bold text-xs text-slate-800 block">Raise Complaint</span>
            <span className="text-[10px] text-slate-400">Wifi • Plumbing • Cleaning</span>
          </div>
        </div>
      </div>
    </div>
  );
}
