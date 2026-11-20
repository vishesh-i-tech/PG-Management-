import Link from "next/link";
import { getAuthContext } from "@/lib/auth/roles";
import { 
  Building2, 
  ShieldCheck, 
  Database, 
  Smartphone, 
  CheckCircle2, 
  Lock, 
  Cpu,
  ArrowRight,
  Phone,
  UserCheck
} from "lucide-react";

export default async function Home() {
  const authContext = await getAuthContext();

  let destinationUrl = "/auth/login";
  let destinationLabel = "Sign In with Mobile OTP";

  if (authContext) {
    if (!authContext.primaryMembership) {
      destinationUrl = "/onboarding";
      destinationLabel = "Complete Onboarding";
    } else {
      const role = authContext.primaryMembership.role;
      if (role === "owner") {
        destinationUrl = "/owner";
        destinationLabel = "Go to Owner Portal";
      } else if (role === "warden") {
        destinationUrl = "/warden";
        destinationLabel = "Go to Warden Portal";
      } else {
        destinationUrl = "/tenant";
        destinationLabel = "Go to Resident App";
      }
    }
  }

  const architecturalPillars = [
    {
      title: "Multi-Tenant Isolation",
      desc: "Engine-level composite foreign keys and PostgreSQL Row Level Security (RLS) across all 28 tables.",
      icon: ShieldCheck,
      badge: "RLS Enforced",
    },
    {
      title: "Mathematical Financial Truth",
      desc: "Immutable payment logs, trigger-maintained cached balances, and automated reconciliation RPCs.",
      icon: Database,
      badge: "ACID Guaranteed",
    },
    {
      title: "Offline-First PWA Shell",
      desc: "Powered by @serwist/next service worker with predictive precaching and mobile manifest.",
      icon: Smartphone,
      badge: "PWA 100%",
    },
    {
      title: "Zero-Trust Concurrency",
      desc: "PostgreSQL exclusion constraints (btree_gist) preventing duplicate bed bookings and overlapping stays.",
      icon: Lock,
      badge: "GIST Exclusions",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight">PG Manager</span>
              <span className="text-xs text-slate-500 block -mt-1 font-mono">v3.0.0 Master Architecture</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Phase 1 &amp; 2 Active
            </span>
            <Link
              href={destinationUrl}
              className="py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
            >
              {authContext ? <UserCheck className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
              <span>{authContext ? "My Portal" : "Sign In"}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-4">
            <Cpu className="w-3.5 h-3.5" /> Phase 2: Auth, Onboarding &amp; Roles Active
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
            Smart, Scalable, &amp; Hardened <br />
            <span className="text-emerald-600">PG Management Architecture</span>
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed mb-8">
            Complete authentication with Indian Phone OTP validation, owner onboarding wizard,
            cryptographic token invitations, and role-guarded middleware routing.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={destinationUrl}
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <span>{destinationLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            {!authContext && (
              <Link
                href="/onboarding"
                className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                <span>Owner Registration</span>
              </Link>
            )}
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16">
          {architecturalPillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-emerald-600">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Deliverables Checklist */}
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Phase 1 &amp; Phase 2 Deliverables Status
          </h2>
          <div className="space-y-4">
            {[
              "Indian Mobile (+91) format validation and E.164 normalization.",
              "Supabase Phone OTP authentication flow with test number presets.",
              "Atomic Owner Onboarding wizard invoking create_new_pg_business RPC.",
              "Cryptographic token generator & SHA-256 hash validation for invitations.",
              "Tenant & Staff invitation redemption via accept_tenant/staff_invitation RPCs.",
              "Next.js Middleware route protection for /owner, /warden, and /tenant portals.",
              "All 28 PostgreSQL 15+ database tables with RLS and composite foreign keys.",
            ].map((check, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm text-slate-700 font-medium">{check}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
