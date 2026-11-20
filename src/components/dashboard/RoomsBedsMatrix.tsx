"use client";

import { useState } from "react";
import { 
  Plus, 
  BedDouble, 
  AlertCircle, 
  Bath, 
  Wind, 
  Maximize2, 
  X, 
  Loader2, 
  UserCheck 
} from "lucide-react";
import { createRoomAction, createBedAction, updateBedStatusAction } from "@/actions/rooms";
import { assignBedAction } from "@/actions/tenants";
import type { RoomType, BedStatus } from "@/types/database.types";

export interface BedData {
  id: string;
  pg_id: string;
  room_id: string;
  bed_label: string;
  monthly_rent: number;
  status: BedStatus;
  current_tenant_name?: string | null;
  current_tenant_id?: string | null;
  assignment_id?: string | null;
}

export interface RoomData {
  id: string;
  pg_id: string;
  room_number: string;
  floor_number: number;
  room_type: RoomType;
  base_monthly_rent: number;
  has_attached_bathroom: boolean;
  has_ac: boolean;
  has_balcony: boolean;
  status: string;
  beds: BedData[];
}

export interface TenantOption {
  id: string;
  full_name: string;
  phone: string;
}

interface RoomsBedsMatrixProps {
  pgId: string;
  rooms: RoomData[];
  availableTenants?: TenantOption[];
  canManage?: boolean;
}

export function RoomsBedsMatrix({
  pgId,
  rooms,
  availableTenants = [],
  canManage = true,
}: RoomsBedsMatrixProps) {
  const [selectedFloor, setSelectedFloor] = useState<number | "all">("all");
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [addBedTargetRoom, setAddBedTargetRoom] = useState<RoomData | null>(null);
  const [assignTargetBed, setAssignTargetBed] = useState<BedData | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Group floors
  const floors = Array.from(new Set(rooms.map((r) => r.floor_number))).sort((a, b) => a - b);
  const filteredRooms = selectedFloor === "all" 
    ? rooms 
    : rooms.filter((r) => r.floor_number === selectedFloor);

  // Stats
  const totalBeds = rooms.reduce((acc, r) => acc + r.beds.length, 0);
  const occupiedBeds = rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.status === "occupied").length, 0);
  const vacantBeds = rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.status === "vacant").length, 0);
  const maintenanceBeds = rooms.reduce((acc, r) => acc + r.beds.filter((b) => b.status === "maintenance").length, 0);
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const handleCreateRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);

    const res = await createRoomAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to create room.");
    } else {
      setIsAddRoomOpen(false);
    }
  };

  const handleCreateBed = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addBedTargetRoom) return;
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("room_id", addBedTargetRoom.id);

    const res = await createBedAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to add bed.");
    } else {
      setAddBedTargetRoom(null);
    }
  };

  const handleAssignBed = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!assignTargetBed) return;
    setLoading(true);
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("bed_id", assignTargetBed.id);

    const res = await assignBedAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to assign bed.");
    } else {
      setAssignTargetBed(null);
    }
  };

  const handleToggleBedStatus = async (bed: BedData, nextStatus: BedStatus) => {
    const formData = new FormData();
    formData.set("pg_id", pgId);
    formData.set("bed_id", bed.id);
    formData.set("status", nextStatus);
    await updateBedStatusAction(formData);
  };

  return (
    <div className="space-y-6">
      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Occupancy</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-slate-900">{occupancyRate}%</span>
            <span className="text-xs text-slate-500">({occupiedBeds}/{totalBeds} beds)</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${occupancyRate}%` }} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">Vacant Beds</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-emerald-700">{vacantBeds}</span>
            <span className="text-xs text-slate-500">ready to move in</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block">Total Rooms</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-slate-900">{rooms.length}</span>
            <span className="text-xs text-slate-500">across {floors.length} floors</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block">Maintenance</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-amber-700">{maintenanceBeds}</span>
            <span className="text-xs text-slate-500">beds undergoing repair</span>
          </div>
        </div>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Floor Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedFloor("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedFloor === "all"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            All Floors
          </button>
          {floors.map((floor) => (
            <button
              key={floor}
              type="button"
              onClick={() => setSelectedFloor(floor)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedFloor === floor
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Floor {floor}
            </button>
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsAddRoomOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Room</span>
          </button>
        )}
      </div>

      {/* Rooms Grid */}
      {filteredRooms.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <BedDouble className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No rooms configured yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Get started by adding your first room with floor number, room type, and monthly rent.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setIsAddRoomOpen(true)}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Room</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const roomOccupied = room.beds.filter((b) => b.status === "occupied").length;
            const roomTotal = room.beds.length;

            return (
              <div
                key={room.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
              >
                <div>
                  {/* Room Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-slate-900">Room {room.room_number}</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          Floor {room.floor_number}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 capitalize block mt-0.5 font-medium">
                        {room.room_type.replace("_", " ")} Sharing • ₹{room.base_monthly_rent.toLocaleString("en-IN")}/mo
                      </span>
                    </div>

                    <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                      roomTotal === 0
                        ? "bg-slate-100 text-slate-600"
                        : roomOccupied === roomTotal
                        ? "bg-blue-100 text-blue-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {roomOccupied}/{roomTotal} Beds
                    </span>
                  </div>

                  {/* Amenities Badges */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {room.has_attached_bathroom && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium">
                        <Bath className="w-3 h-3 text-slate-500" /> Attached Bath
                      </span>
                    )}
                    {room.has_ac && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium">
                        <Wind className="w-3 h-3 text-sky-500" /> AC
                      </span>
                    )}
                    {room.has_balcony && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium">
                        <Maximize2 className="w-3 h-3 text-emerald-500" /> Balcony
                      </span>
                    )}
                  </div>

                  {/* Bed Chips List */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Beds Configuration
                    </span>

                    {room.beds.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-1">No beds added yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {room.beds.map((bed) => {
                          const isOccupied = bed.status === "occupied";
                          const isVacant = bed.status === "vacant";
                          const isMaintenance = bed.status === "maintenance";

                          return (
                            <div
                              key={bed.id}
                              className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                                isOccupied
                                  ? "bg-blue-50/60 border-blue-200 text-blue-900"
                                  : isVacant
                                  ? "bg-emerald-50/50 border-emerald-200 text-emerald-950"
                                  : "bg-slate-50 border-slate-200 text-slate-700"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="font-bold flex items-center gap-1.5">
                                  <BedDouble className={`w-3.5 h-3.5 ${
                                    isOccupied ? "text-blue-600" : isVacant ? "text-emerald-600" : "text-slate-400"
                                  }`} />
                                  {bed.bed_label}
                                </span>
                                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                                  isOccupied
                                    ? "bg-blue-200/80 text-blue-800"
                                    : isVacant
                                    ? "bg-emerald-200/80 text-emerald-800"
                                    : "bg-slate-200 text-slate-700"
                                }`}>
                                  {bed.status}
                                </span>
                              </div>

                              {isOccupied ? (
                                <div className="text-[11px] text-blue-800 font-medium truncate mt-1">
                                  👤 {bed.current_tenant_name || "Active Resident"}
                                </div>
                              ) : isVacant && canManage ? (
                                <button
                                  type="button"
                                  onClick={() => setAssignTargetBed(bed)}
                                  className="mt-1 w-full py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-xs flex items-center justify-center gap-1 transition-colors"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>Assign</span>
                                </button>
                              ) : null}

                              {canManage && (
                                <div className="flex items-center justify-end gap-1 mt-1.5 pt-1 border-t border-slate-200/50 text-[10px]">
                                  {isMaintenance ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleBedStatus(bed, "vacant")}
                                      className="text-emerald-700 hover:underline font-semibold"
                                    >
                                      Mark Vacant
                                    </button>
                                  ) : isVacant ? (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleBedStatus(bed, "maintenance")}
                                      className="text-slate-500 hover:text-amber-700 font-semibold"
                                    >
                                      Maintenance
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Room Footer Action */}
                {canManage && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      ₹{room.base_monthly_rent.toLocaleString("en-IN")}/mo default
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddBedTargetRoom(room)}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Bed</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODAL: Add Room --- */}
      {isAddRoomOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setIsAddRoomOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Add New Room</h3>
            <p className="text-xs text-slate-500 mb-4">Create a room entity to structure bed inventory.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Room Number</label>
                  <input
                    type="text"
                    name="room_number"
                    required
                    placeholder="e.g. 101"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Floor Number</label>
                  <input
                    type="number"
                    name="floor_number"
                    defaultValue={1}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Room Type</label>
                  <select
                    name="room_type"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    <option value="single">Single Sharing</option>
                    <option value="double">Double Sharing</option>
                    <option value="triple">Triple Sharing</option>
                    <option value="four_sharing">Four Sharing</option>
                    <option value="dormitory">Dormitory</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Base Rent (₹)</label>
                  <input
                    type="number"
                    name="base_monthly_rent"
                    required
                    placeholder="e.g. 8000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-xs font-semibold text-slate-700 block mb-1">Amenities</span>
                <div className="flex items-center gap-4 text-xs text-slate-700">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" name="has_attached_bathroom" value="true" className="rounded text-emerald-600 focus:ring-emerald-500" />
                    <span>Attached Bath</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" name="has_ac" value="true" className="rounded text-emerald-600 focus:ring-emerald-500" />
                    <span>Air Conditioner</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" name="has_balcony" value="true" className="rounded text-emerald-600 focus:ring-emerald-500" />
                    <span>Balcony</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddRoomOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Add Bed --- */}
      {addBedTargetRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setAddBedTargetRoom(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Add Bed to Room {addBedTargetRoom.room_number}</h3>
            <p className="text-xs text-slate-500 mb-4">Each bed receives an exclusive occupancy identifier.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateBed} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Bed Identifier / Label</label>
                <input
                  type="text"
                  name="bed_label"
                  required
                  placeholder="e.g. Bed-A or Bed-1"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Monthly Bed Rent (₹)</label>
                <input
                  type="number"
                  name="monthly_rent"
                  required
                  defaultValue={addBedTargetRoom.base_monthly_rent}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddBedTargetRoom(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Bed</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: Assign Bed to Tenant --- */}
      {assignTargetBed && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setAssignTargetBed(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">Assign {assignTargetBed.bed_label}</h3>
            <p className="text-xs text-slate-500 mb-4">PostgreSQL exclusion constraint guarantees no double-occupancy.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAssignBed} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Select Tenant</label>
                {availableTenants.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                    No unassigned active tenants found. Please register a tenant first.
                  </p>
                ) : (
                  <select
                    name="tenant_id"
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    {availableTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.phone})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Agreed Monthly Rent (₹)</label>
                <input
                  type="number"
                  name="agreed_monthly_rent"
                  required
                  defaultValue={assignTargetBed.monthly_rent}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Assigned From Date</label>
                <input
                  type="date"
                  name="assigned_from"
                  required
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignTargetBed(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || availableTenants.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Assignment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
