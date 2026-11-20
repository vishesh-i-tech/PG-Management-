"use client";

import { useState } from "react";
import { 
  GateRegister, 
  type GateStateSummary, 
  type GateEventItem, 
  type NightOutRequestItem, 
  type CurfewAlertTenant, 
  type SimpleTenant 
} from "@/components/dashboard/GateRegister";
import { RoomsBedsMatrix, type RoomData } from "@/components/dashboard/RoomsBedsMatrix";
import { ComplaintsBoard, type ComplaintItem } from "@/components/dashboard/ComplaintsBoard";
import { MessMenuPlanner, type MessMenuItem } from "@/components/dashboard/MessMenuPlanner";
import { 
  DoorClosed, 
  BedDouble, 
  Wrench, 
  UtensilsCrossed, 
  AlertTriangle 
} from "lucide-react";

interface WardenDashboardClientProps {
  pg: {
    id: string;
    name: string;
    gate_closing_time: string;
  };
  wardenName: string;
  gateSummary: GateStateSummary;
  recentGateEvents: GateEventItem[];
  pendingNightOuts: NightOutRequestItem[];
  curfewAlerts: CurfewAlertTenant[];
  tenants: SimpleTenant[];
  rooms: RoomData[];
  complaints: ComplaintItem[];
  menuItems: MessMenuItem[];
}

export function WardenDashboardClient({
  pg,
  wardenName,
  gateSummary,
  recentGateEvents,
  pendingNightOuts,
  curfewAlerts,
  tenants,
  rooms,
  complaints,
  menuItems,
}: WardenDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<"gate" | "rooms" | "complaints" | "mess">("gate");

  const openComplaintsCount = complaints.filter((c) => c.status === "open" || c.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-blue-300 uppercase tracking-wider block mb-1">
            Warden On Duty • {wardenName}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {pg.name} Operations
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Night curfew closing time: <span className="font-bold text-white">{pg.gate_closing_time}</span>
          </p>
        </div>

        {curfewAlerts.length > 0 && (
          <div className="bg-red-500/20 border border-red-400 text-red-200 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{curfewAlerts.length} Residents Outside Past Curfew!</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
        {[
          { key: "gate", label: "Gate & Curfew", icon: DoorClosed, alert: curfewAlerts.length > 0 },
          { key: "rooms", label: "Rooms & Occupancy", icon: BedDouble },
          { key: "complaints", label: "Complaints Queue", icon: Wrench, count: openComplaintsCount },
          { key: "mess", label: "Mess Schedule", icon: UtensilsCrossed },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  isActive ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.alert && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Views */}
      {activeTab === "gate" && (
        <GateRegister
          pgId={pg.id}
          summary={gateSummary}
          recentEvents={recentGateEvents}
          pendingNightOuts={pendingNightOuts}
          curfewAlerts={curfewAlerts}
          tenants={tenants}
          canManage={true}
        />
      )}

      {activeTab === "rooms" && (
        <RoomsBedsMatrix
          pgId={pg.id}
          rooms={rooms}
          canManage={false}
        />
      )}

      {activeTab === "complaints" && (
        <ComplaintsBoard
          pgId={pg.id}
          complaints={complaints}
          canManage={true}
        />
      )}

      {activeTab === "mess" && (
        <MessMenuPlanner
          pgId={pg.id}
          menuItems={menuItems}
          canManage={true}
        />
      )}
    </div>
  );
}
