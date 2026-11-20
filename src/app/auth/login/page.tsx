"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatToE164, isValidIndianPhone } from "@/lib/auth/phone-validation";
import { 
  Building2, 
  KeyRound, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RotateCcw 
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [formattedPhone, setFormattedPhone] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabase = createClient();

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isValidIndianPhone(phoneInput)) {
      setErrorMsg("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    let e164: string;
    try {
      e164 = formatToE164(phoneInput);
    } catch {
      setErrorMsg("Invalid phone number format.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: {
          channel: "sms",
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setFormattedPhone(e164);
        setStep("otp");
        setSuccessMsg(`OTP sent successfully to ${e164}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanOtp = otpInput.trim();
    if (cleanOtp.length < 6) {
      setErrorMsg("Please enter the complete 6-digit OTP code.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: cleanOtp,
        type: "sms",
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      setSuccessMsg("Verification successful! Redirecting...");
      router.push(redirectPath);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OTP verification failed.";
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  const fillTestNumber = () => {
    setPhoneInput("9876543210");
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-600/20 mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">PG Manager</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Secure Indian Mobile OTP Authentication
          </p>
        </div>

        {/* Error / Success Notifications */}
        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Phone Input */}
        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Mobile Number
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 flex items-center gap-1.5 text-slate-500 font-mono text-sm border-r border-slate-200 pr-2.5">
                  <span className="text-base">🇮🇳</span>
                  <span className="font-semibold">+91</span>
                </div>
                <input
                  type="tel"
                  placeholder="98765 43210"
                  maxLength={10}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                  className="w-full pl-24 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                We will send a 6-digit OTP verification code.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || phoneInput.length < 10}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending OTP...</span>
                </>
              ) : (
                <>
                  <span>Get OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Development Preset Helper */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={fillTestNumber}
                className="text-xs text-slate-500 hover:text-emerald-700 font-mono underline transition-colors"
              >
                Use test number (+91 98765 43210)
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: OTP Verification */
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Enter 6-Digit OTP
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtpInput("");
                    setErrorMsg(null);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  Change Number
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                  className="w-full py-3.5 px-4 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Sent to <span className="font-semibold text-slate-700 font-mono">{formattedPhone}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otpInput.length < 6}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Verify &amp; Continue</span>
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-emerald-700 font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Resend OTP Code</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md p-8 bg-white rounded-3xl border border-slate-100 shadow-xl flex items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-sm font-medium">Loading secure portal...</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
