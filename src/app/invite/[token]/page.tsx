import Link from "next/link";
import { getAuthContext } from "@/lib/auth/roles";
import { acceptInvitationAction } from "@/actions/invitations";
import { Ticket, CheckCircle2, AlertCircle, ArrowRight, Phone } from "lucide-react";

interface InvitePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function InviteRedemptionPage({ params }: InvitePageProps) {
  const { token } = await params;
  const authContext = await getAuthContext();

  let redemptionResult: {
    success: boolean;
    role?: string;
    redirectUrl?: string;
    error?: string;
  } | null = null;

  if (authContext) {
    redemptionResult = await acceptInvitationAction(token);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/20">
          <Ticket className="w-7 h-7" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          PG Manager Invitation
        </h1>

        {/* Not Logged In Case */}
        {!authContext ? (
          <div>
            <p className="text-sm text-slate-600 mb-6">
              You have been invited to join a PG property. Please sign in with your invited mobile number to accept.
            </p>
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs mb-6 text-left">
              <strong>Important:</strong> You must authenticate with the exact phone number to which this invitation was issued.
            </div>
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
            >
              <Phone className="w-4 h-4" />
              <span>Verify Mobile OTP to Accept</span>
            </Link>
          </div>
        ) : redemptionResult?.success ? (
          /* Successfully Redeemed */
          <div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm mb-6 flex items-start gap-2.5 text-left">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Invitation Accepted!</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Your account is now linked as an active {redemptionResult.role}.
                </p>
              </div>
            </div>

            <Link
              href={redemptionResult.redirectUrl || "/"}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
            >
              <span>Go to My Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          /* Error Redeeming */
          <div>
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm mb-6 flex items-start gap-2.5 text-left">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Redemption Failed</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {redemptionResult?.error || "This invitation token is invalid or expired."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/onboarding"
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm block"
              >
                Go to Onboarding
              </Link>
              <Link
                href="/"
                className="w-full py-2.5 px-4 text-slate-500 hover:text-slate-800 text-xs block"
              >
                Return to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
