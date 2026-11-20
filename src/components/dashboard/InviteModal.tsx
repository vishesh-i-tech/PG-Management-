"use client";

import { useState } from "react";
import { createStaffInvitationAction } from "@/actions/invitations";
import { 
  UserPlus, 
  Copy, 
  Check, 
  Loader2, 
  AlertCircle, 
  X
} from "lucide-react";

interface InviteModalProps {
  pgId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function InviteModal({ pgId, isOpen, onClose }: InviteModalProps) {
  const [inviteType, setInviteType] = useState<"warden" | "owner">("warden");
  const [targetContact, setTargetContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setGeneratedLink(null);

    try {
      const result = await createStaffInvitationAction(pgId, targetContact, inviteType);
      if (!result.success) {
        setErrorMsg(result.error || "Failed to generate invitation.");
      } else {
        const fullUrl = `${window.location.origin}${result.inviteLink}`;
        setGeneratedLink(fullUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error generating invite.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Invite Staff Member</h3>
            <p className="text-xs text-slate-500">Generate secure SHA-256 invitation token</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!generatedLink ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Designated Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInviteType("warden")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    inviteType === "warden"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Warden
                </button>
                <button
                  type="button"
                  onClick={() => setInviteType("owner")}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    inviteType === "owner"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Co-Owner
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Staff Phone or Email
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 9876543210 or staff@example.com"
                value={targetContact}
                onChange={(e) => setTargetContact(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !targetContact.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Token...</span>
                </>
              ) : (
                <span>Create Cryptographic Invite</span>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <p className="font-bold text-sm mb-1">Invitation Link Created!</p>
              <p>Share this link with your designated {inviteType}. It will expire in 7 days.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Shareable Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setGeneratedLink(null);
                setTargetContact("");
              }}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Generate Another Invite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
