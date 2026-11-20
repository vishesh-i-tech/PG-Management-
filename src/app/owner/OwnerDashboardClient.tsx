"use client";

import { useState } from "react";
import { InviteModal } from "@/components/dashboard/InviteModal";
import { 
  Building2, 
  UserPlus, 
  BedDouble, 
  Users, 
  CreditCard, 
  MapPin, 
  Phone, 
  Clock, 
  ShieldCheck, 
  Sparkles
} from "lucide-react";

interface OwnerDashboardClientProps {
  pg: {
    id: string;
    name: string;
    slug: string;
    address_line1: string;
    city: string;
    state: string;
    pincode: string;
    contact_phone: string;
    gender_type: string;
    gate_closing_time: string;
  };
  ownerName: string;
}

export function OwnerDashboardClient({ pg, ownerName }: OwnerDashboardClientProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Phase 2 Active
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome, {ownerName}
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Your PG property <span className="font-semibold text-white">{pg.name}</span> is 
              configured with engine-enforced multi-tenant isolation and Row Level Security.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl text-sm shadow-lg flex items-center justify-center gap-2 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Staff Member</span>
          </button>
        </div>
      </div>

      {/* Property Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Property Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block uppercase">Address</span>
              <span className="font-medium text-slate-800 flex items-start gap-1.5 mt-0.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                {pg.address_line1}, {pg.city}, {pg.state} - {pg.pincode}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block uppercase">Contact Phone</span>
              <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5 font-mono">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                {pg.contact_phone}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block uppercase">Gender Category</span>
              <span className="font-bold text-slate-800 capitalize mt-0.5 block">
                {pg.gender_type} PG
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-xs font-semibold text-slate-400 block uppercase">Daily Gate Closing</span>
              <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5 font-mono">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                {pg.gate_closing_time}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Multi-Tenant Status */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Tenant Isolation
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              All records for this PG are isolated at the database level using composite foreign keys and PostgreSQL Row Level Security (RLS).
            </p>
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                <span className="block text-[10px] text-emerald-600 uppercase font-semibold">Active PG UUID</span>
                <span className="font-bold truncate block">{pg.id}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Role: Owner</span>
            <span className="font-semibold text-emerald-600">Permissions 100%</span>
          </div>
        </div>
      </div>

      {/* Phase 3 Roadmap Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Core Operations Modules (Phase 3 Roadmap)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center mb-2">
              <BedDouble className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Room &amp; Bed Matrix</h4>
            <p className="text-xs text-slate-500 mt-1">Occupancy grid, pricing, and exclusions.</p>
          </div>
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center mb-2">
              <Users className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Tenant Directory &amp; KYC</h4>
            <p className="text-xs text-slate-500 mt-1">Masked identity documents &amp; emergency contacts.</p>
          </div>
          <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center mb-2">
              <CreditCard className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">Rent Billing Ledger</h4>
            <p className="text-xs text-slate-500 mt-1">Automated invoices, payments &amp; reconciliations.</p>
          </div>
        </div>
      </div>

      <InviteModal
        pgId={pg.id}
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </div>
  );
}
