import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { 
  Building2, 
  DoorClosed, 
  AlertTriangle, 
  UtensilsCrossed, 
  Users, 
  Clock, 
  Phone 
} from "lucide-react";

export default async function WardenPage() {
  const context = await getAuthContext();

  if (!context || !context.primaryMembership) {
    redirect("/onboarding");
  }

  const supabase = await createClient();

  const { data: pg } = await supabase
    .from("pgs")
    .select("*")
    .eq("id", context.primaryMembership.pg_id)
    .single();

  if (!pg) {
    redirect("/onboarding");
  }

  return (
    <div className="space-y-6">
      {/* Warden Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Warden Operations Dashboard
        </h1>
        <p className="text-sm text-slate-300 mt-1 max-w-xl">
          Managing physical security, gate attendance, tenant complaints, and daily facilities for{" "}
          <span className="font-semibold text-white">{pg.name}</span>.
        </p>
      </div>

      {/* Property & Gate Operational Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase block">Night Curfew</span>
          <span className="text-xl font-bold text-slate-900 font-mono mt-1 block">
            {pg.gate_closing_time} IST
          </span>
          <p className="text-xs text-slate-500 mt-1">Automatic 45-min pre-closing alert active.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase block">Property Type</span>
          <span className="text-xl font-bold text-slate-900 capitalize mt-1 block">
            {pg.gender_type} PG
          </span>
          <p className="text-xs text-slate-500 mt-1">{pg.city}, {pg.state}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
            <Phone className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase block">Office Contact</span>
          <span className="text-base font-bold text-slate-900 font-mono mt-1 block">
            {pg.contact_phone}
          </span>
          <p className="text-xs text-slate-500 mt-1">Property Helpline</p>
        </div>
      </div>

      {/* Operations Quick Links (Phase 3 Roadmap) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Warden Daily Tools (Phase 3 Operational Modules)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
              <DoorClosed className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Gate Movement Log</h4>
            <p className="text-xs text-slate-500 mt-1">Log check-in, late check-in, and night-out departures.</p>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Complaints Desk</h4>
            <p className="text-xs text-slate-500 mt-1">Review plumbing, electrical, and maintenance tickets.</p>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Mess Menu Editor</h4>
            <p className="text-xs text-slate-500 mt-1">Daily breakfast, lunch, snack, and dinner scheduling.</p>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center mb-2">
              <Users className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Tenant Directory</h4>
            <p className="text-xs text-slate-500 mt-1">View active tenants, assigned rooms, and emergency contacts.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
