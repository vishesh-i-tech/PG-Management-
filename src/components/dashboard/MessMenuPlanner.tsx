"use client";

import { useState } from "react";
import { 
  Clock, 
  Edit3, 
  X, 
  Loader2, 
  AlertCircle 
} from "lucide-react";
import { upsertMessMenuItemAction } from "@/actions/mess";
import type { MealType } from "@/types/database.types";

export interface MessMenuItem {
  id: string;
  pg_id: string;
  day_of_week: number;
  meal_type: MealType;
  menu_items: string;
  start_time: string;
  end_time: string;
  special_notes: string | null;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

const MEALS: { type: MealType; label: string; defaultStart: string; defaultEnd: string }[] = [
  { type: "breakfast", label: "Breakfast", defaultStart: "07:30", defaultEnd: "09:30" },
  { type: "lunch", label: "Lunch", defaultStart: "12:30", defaultEnd: "14:30" },
  { type: "evening_snacks", label: "Evening Tea & Snacks", defaultStart: "17:00", defaultEnd: "18:30" },
  { type: "dinner", label: "Dinner", defaultStart: "20:00", defaultEnd: "22:00" },
];

interface MessMenuPlannerProps {
  pgId: string;
  menuItems: MessMenuItem[];
  canManage?: boolean;
}

export function MessMenuPlanner({
  pgId,
  menuItems,
  canManage = true,
}: MessMenuPlannerProps) {
  const currentDayIndex = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState<number>(currentDayIndex);
  const [editTarget, setEditTarget] = useState<{
    day: number;
    meal: typeof MEALS[0];
    existing?: MessMenuItem;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dayItems = menuItems.filter((m) => m.day_of_week === selectedDay);

  const handleSaveMeal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTarget) return;
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set("pg_id", pgId);
    formData.set("day_of_week", editTarget.day.toString());
    formData.set("meal_type", editTarget.meal.type);

    const res = await upsertMessMenuItemAction(formData);
    setLoading(false);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to update menu.");
    } else {
      setEditTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Day Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {DAYS.map((dayName, idx) => {
          const isToday = idx === currentDayIndex;
          const isSelected = idx === selectedDay;

          return (
            <button
              key={dayName}
              type="button"
              onClick={() => setSelectedDay(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                isSelected
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{dayName}</span>
              {isToday && (
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-emerald-400" : "bg-emerald-600"}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* 4 Meals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MEALS.map((meal) => {
          const item = dayItems.find((m) => m.meal_type === meal.type);

          return (
            <div
              key={meal.type}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    {meal.label}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{item?.start_time || meal.defaultStart} - {item?.end_time || meal.defaultEnd}</span>
                  </span>
                </div>

                {item ? (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">
                      {item.menu_items}
                    </p>
                    {item.special_notes && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg font-medium">
                        ✨ {item.special_notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400 italic">
                    Menu not updated yet
                  </div>
                )}
              </div>

              {canManage && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setEditTarget({ day: selectedDay, meal, existing: item })}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{item ? "Edit Dishes" : "Set Dishes"}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- MODAL: Edit Meal Menu --- */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-1">
              {DAYS[editTarget.day]} {editTarget.meal.label}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Set menu items served to residents.</p>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveMeal} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Start Time</label>
                  <input
                    type="time"
                    name="start_time"
                    required
                    defaultValue={editTarget.existing?.start_time || editTarget.meal.defaultStart}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    name="end_time"
                    required
                    defaultValue={editTarget.existing?.end_time || editTarget.meal.defaultEnd}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Dishes / Menu Items</label>
                <textarea
                  name="menu_items"
                  required
                  rows={3}
                  defaultValue={editTarget.existing?.menu_items || ""}
                  placeholder="e.g. Masala Dosa, Sambar, Coconut Chutney, Tea / Coffee"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Special Notes / Feast (Optional)</label>
                <input
                  type="text"
                  name="special_notes"
                  defaultValue={editTarget.existing?.special_notes || ""}
                  placeholder="e.g. Sweet Gulab Jamun on Sunday special"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
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
                  <span>Save Menu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
