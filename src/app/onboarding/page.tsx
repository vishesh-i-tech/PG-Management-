"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPGBusinessAction } from "@/actions/onboarding";
import { acceptInvitationAction } from "@/actions/invitations";
import { signOutAction } from "@/actions/auth";
import { 
  Building2, 
  Ticket, 
  ArrowRight, 
  AlertCircle, 
  Loader2, 
  LogOut, 
  Sparkles
} from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"choose" | "owner" | "invite">("choose");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invite mode state
  const [inviteToken, setInviteToken] = useState("");

  // Owner mode state
  const [ownerForm, setOwnerForm] = useState({
    fullName: "",
    name: "",
    slug: "",
    genderType: "coed",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    contactPhone: "",
  });

  const handleOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const formData = new FormData();
    Object.entries(ownerForm).forEach(([k, v]) => formData.append(k, v));

    try {
      const result = await createPGBusinessAction(formData);
      if (!result.success) {
        setErrorMsg(result.error || "Failed to create PG property.");
        setLoading(false);
      } else {
        router.push("/owner");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed.";
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await acceptInvitationAction(inviteToken);
      if (!result.success) {
        setErrorMsg(result.error || "Failed to redeem invitation.");
        setLoading(false);
      } else {
        router.push(result.redirectUrl || "/");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Redemption failed.";
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Navbar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">PG Manager</span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-xs font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </form>
      </header>

      {/* Main Container */}
      <div className="max-w-xl w-full mx-auto my-auto">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Choice Screen */}
        {mode === "choose" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Welcome to PG Manager
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              How will you use PG Manager?
            </h1>
            <p className="text-sm text-slate-600 mb-8 max-w-md mx-auto">
              Choose your role to configure your multi-tenant account or connect to an existing PG.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMode("owner")}
                className="p-6 rounded-2xl border-2 border-emerald-500/30 hover:border-emerald-600 bg-emerald-50/30 hover:bg-emerald-50/70 text-left transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-4 shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-1 flex items-center justify-between">
                  <span>I am a PG Owner</span>
                  <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition-transform" />
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Register your PG property, configure rooms &amp; beds, and manage staff &amp; tenants.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("invite")}
                className="p-6 rounded-2xl border-2 border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50 text-left transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Ticket className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-1 flex items-center justify-between">
                  <span>I have an Invite</span>
                  <ArrowRight className="w-4 h-4 text-slate-700 group-hover:translate-x-1 transition-transform" />
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Join as a Tenant or Warden using an invitation code shared by your PG Owner.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Mode 1: Owner Wizard */}
        {mode === "owner" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Register PG Property</h2>
                <p className="text-xs text-slate-500">Atomic Owner Initialization RPC</p>
              </div>
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Back
              </button>
            </div>

            <form onSubmit={handleOwnerSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={ownerForm.fullName}
                  onChange={(e) => setOwnerForm({ ...ownerForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    PG Property Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Layout Residency"
                    value={ownerForm.name}
                    onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Property Slug (URL)
                  </label>
                  <input
                    type="text"
                    placeholder="layout-residency"
                    value={ownerForm.slug}
                    onChange={(e) => setOwnerForm({ ...ownerForm, slug: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Gender Type
                  </label>
                  <select
                    value={ownerForm.genderType}
                    onChange={(e) => setOwnerForm({ ...ownerForm, genderType: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="coed">Co-Ed (All Welcome)</option>
                    <option value="boys">Boys Only</option>
                    <option value="girls">Girls Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    maxLength={10}
                    value={ownerForm.contactPhone}
                    onChange={(e) => setOwnerForm({ ...ownerForm, contactPhone: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Address Line 1
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street / Building No / Landmark"
                  value={ownerForm.addressLine1}
                  onChange={(e) => setOwnerForm({ ...ownerForm, addressLine1: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bengaluru"
                    value={ownerForm.city}
                    onChange={(e) => setOwnerForm({ ...ownerForm, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    State
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Karnataka"
                    value={ownerForm.state}
                    onChange={(e) => setOwnerForm({ ...ownerForm, state: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Pincode
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="560001"
                    value={ownerForm.pincode}
                    onChange={(e) => setOwnerForm({ ...ownerForm, pincode: e.target.value.replace(/\D/g, "") })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Registering Property...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-4 h-4" />
                    <span>Create PG &amp; Continue</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Mode 2: Invitation Code */}
        {mode === "invite" && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Redeem Invitation</h2>
                <p className="text-xs text-slate-500">SHA-256 Verified Multi-Tenant Token</p>
              </div>
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Back
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Invitation Token or Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="Paste your 64-character invite token"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Enter the invitation code sent to your registered phone number.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !inviteToken.trim()}
                className="w-full py-3.5 mt-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Validating Token...</span>
                  </>
                ) : (
                  <>
                    <Ticket className="w-4 h-4" />
                    <span>Redeem &amp; Join PG</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      <footer className="text-center py-4 text-xs text-slate-400">
        PG Manager by The Layout Office • Version 3.0.0
      </footer>
    </div>
  );
}
