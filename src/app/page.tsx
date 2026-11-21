import Link from "next/link";
import { getAuthContext } from "@/lib/auth/roles";
import { 
  Building2, 
  Calendar, 
  Users, 
  Bed, 
  ArrowRight, 
  ShieldCheck, 
  Wifi, 
  Clock, 
  Sparkles,
  Utensils,
  Dumbbell,
  Briefcase,
  Star,
  Phone,
  UserCheck,
  ChevronRight,
  Play,
  KeyRound,
  Shield,
  Zap,
  Shirt,
  Sparkle
} from "lucide-react";

export default async function Home() {
  const authContext = await getAuthContext();

  let destinationUrl = "/auth/login";
  let destinationLabel = "Sign In / Portal";

  if (authContext) {
    if (!authContext.primaryMembership) {
      destinationUrl = "/onboarding";
      destinationLabel = "Complete Onboarding";
    } else {
      const role = authContext.primaryMembership.role;
      if (role === "owner") {
        destinationUrl = "/owner";
        destinationLabel = "Owner Portal";
      } else if (role === "warden") {
        destinationUrl = "/warden";
        destinationLabel = "Warden Portal";
      } else {
        destinationUrl = "/tenant";
        destinationLabel = "Resident Portal";
      }
    }
  }

  const roomCards = [
    {
      title: "Private Single Suite",
      specs: "1 Private Bed · Attached Bath · AC · Ergonomic Desk",
      price: "₹14,999",
      period: "/ month",
      image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
      url: destinationUrl,
    },
    {
      title: "Executive Twin Sharing",
      specs: "2 Beds · Attached Washroom · High-Speed WiFi · Balcony",
      price: "₹9,999",
      period: "/ month",
      image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
      url: destinationUrl,
    },
    {
      title: "Premium 3-Sharing Room",
      specs: "3 Beds · Dedicated Study Tables · 4 Meals Included",
      price: "₹7,499",
      period: "/ month",
      image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80",
      url: destinationUrl,
    },
  ];

  const amenitiesList = [
    { title: "4-Meal Daily Mess", icon: Utensils },
    { title: "300 Mbps Fiber WiFi", icon: Wifi },
    { title: "Biometric 24/7 Security", icon: ShieldCheck },
    { title: "100% Power Backup", icon: Zap },
    { title: "Laundry & Washing", icon: Shirt },
    { title: "Daily Housekeeping", icon: Sparkle },
  ];

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-slate-800 selection:bg-[#C5A880] selection:text-white">
      {/* ============================================================ */}
      {/* 1. TOP NAVIGATION BAR (Dark luxury translucent backdrop)     */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 bg-[#070F15]/90 backdrop-blur-md border-b border-white/10 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            {/* Geometric Mountain/Haven Crest Icon */}
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#C5A880] to-[#9E825D] flex items-center justify-center text-[#070F15] shadow-lg shadow-[#C5A880]/20 group-hover:scale-105 transition-transform">
              <Building2 className="w-5 h-5 text-[#070F15]" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-lg text-white tracking-[0.16em] uppercase leading-none">
                HAVEN LIVING
              </span>
              <span className="text-[9px] tracking-[0.25em] text-[#C5A880] uppercase mt-1 font-sans font-medium">
                PREMIUM PG &amp; HOSTELS
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium tracking-wider text-slate-300">
            <Link href="#home" className="text-white border-b-2 border-[#C5A880] pb-1 transition-colors">
              Home
            </Link>
            <Link href="#rooms" className="hover:text-white transition-colors">
              Rooms &amp; Sharing
            </Link>
            <Link href="#amenities" className="hover:text-white transition-colors">
              Amenities
            </Link>
            <Link href="#dining" className="hover:text-white transition-colors">
              Daily Mess
            </Link>
            <Link href="#reviews" className="hover:text-white transition-colors">
              Resident Reviews
            </Link>
            <Link href="/owner" className="hover:text-[#C5A880] transition-colors">
              Portals
            </Link>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href={destinationUrl}
              className="px-5 py-2.5 bg-[#C5A880] hover:bg-[#B8986E] text-[#070F15] font-semibold text-xs tracking-wider uppercase rounded-full shadow-md shadow-[#C5A880]/20 flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-[#C5A880]/30"
            >
              <Bed className="w-3.5 h-3.5" />
              <span>Book a Bed</span>
            </Link>

            <Link
              href={destinationUrl}
              className="hidden sm:inline-flex px-4 py-2 border border-[#C5A880]/40 hover:border-[#C5A880] text-[#C5A880] hover:text-white rounded-full text-xs font-medium tracking-wide transition-all"
            >
              {authContext ? (
                <span className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> My Portal</span>
              ) : (
                <span className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Sign In</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. HERO SECTION (Dark Luxury Theme with PG Search & Mockup)  */}
      {/* ============================================================ */}
      <section id="home" className="relative bg-[#070F15] overflow-hidden pt-12 pb-24 md:pt-16 md:pb-32">
        {/* Ambient Warm Gradient Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#C5A880]/15 rounded-full blur-[128px]"></div>
          <div className="absolute top-1/2 right-0 w-[550px] h-[550px] bg-[#0A2730]/40 rounded-full blur-[150px]"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Column: Heading & Booking Widget */}
            <div className="lg:col-span-7 z-10">
              <span className="inline-block text-[11px] font-semibold tracking-[0.28em] text-[#C5A880] uppercase mb-4">
                PREMIUM STUDENT &amp; CO-LIVING STAYS · ZERO BROKERAGE
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif text-white leading-[1.12] tracking-tight mb-5">
                More Than a PG, <br />
                <span className="italic font-normal text-[#E8D7C2]">It&apos;s Your Second Home</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 font-light max-w-xl leading-relaxed mb-8">
                Discover modern co-living designed for students and working professionals. 
                Enjoy chef-prepared home-style food, high-speed WiFi, biometric gate security, and instant UPI rent payments.
              </p>

              {/* Floating Bed Booking Search Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-2xl border border-white/20 max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pb-4 border-b border-slate-100">
                  {/* Move In Date */}
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Move In Date</span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium text-xs sm:text-sm">
                      <Calendar className="w-4 h-4 text-[#C5A880]" />
                      <span>Dec 01, 2026</span>
                    </div>
                  </div>

                  {/* Sharing Type */}
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Room Sharing</span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium text-xs sm:text-sm">
                      <Bed className="w-4 h-4 text-[#C5A880]" />
                      <span>Single / Twin / 3-Bed</span>
                    </div>
                  </div>

                  {/* PG Category */}
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Category</span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium text-xs sm:text-sm">
                      <Users className="w-4 h-4 text-[#C5A880]" />
                      <span>Boys / Girls / Unisex</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Link
                    href={destinationUrl}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#C5A880] hover:bg-[#B8986E] text-white font-semibold text-xs tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-[#C5A880]/30"
                  >
                    <span>Check Bed Availability</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* 4 Feature Badges Below Widget */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-4">
                <div className="flex items-center gap-3 text-slate-300">
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[#C5A880] shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="text-[11px] font-light leading-snug">
                    <span className="font-medium text-white block">Zero Brokerage</span> Guaranteed
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[#C5A880] shrink-0">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div className="text-[11px] font-light leading-snug">
                    <span className="font-medium text-white block">300 Mbps WiFi</span> High-Speed
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[#C5A880] shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="text-[11px] font-light leading-snug">
                    <span className="font-medium text-white block">24/7 Gate</span> Biometric Security
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[#C5A880] shrink-0">
                    <Utensils className="w-4 h-4" />
                  </div>
                  <div className="text-[11px] font-light leading-snug">
                    <span className="font-medium text-white block">4-Meal Mess</span> Fresh &amp; Hygienic
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: High-End Dual Mockup (Laptop & Mobile Showcase) */}
            <div className="lg:col-span-5 relative flex items-center justify-center">
              <div className="relative w-full max-w-lg">
                {/* Laptop Showcase Frame (Showing PG Management Dashboard) */}
                <div className="relative bg-slate-900 rounded-2xl border-4 border-slate-700 shadow-2xl overflow-hidden aspect-[16/10] z-10 group">
                  <img
                    src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80"
                    alt="Haven Living Coliving Screen"
                    className="w-full h-full object-cover brightness-90 group-hover:scale-105 transition-transform duration-700"
                  />
                  {/* Laptop Overlay Interface Mockup */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/70 p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-white text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      </div>
                      <span className="text-white/60 tracking-wider">havenliving.app/dashboard</span>
                      <div className="w-12"></div>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] uppercase tracking-widest text-[#C5A880] block">PG &amp; COLIVING OPERATING SYSTEM</span>
                      <h4 className="font-serif text-white text-base">Haven Management Portal</h4>
                      <p className="text-[10px] text-slate-300 italic font-serif">Bed Matrix &middot; UPI Payments &middot; Curfew Alerts</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded p-2 text-[9px] text-white flex justify-between items-center">
                      <span>Live Occupancy: 94% Booked</span>
                      <span className="text-[#C5A880]">Open Portal →</span>
                    </div>
                  </div>
                </div>

                {/* Smartphone Mockup (Overlapping right) */}
                <div className="absolute -bottom-6 -right-4 sm:-right-8 w-36 sm:w-44 bg-slate-900 rounded-3xl border-4 border-slate-700 shadow-2xl overflow-hidden aspect-[9/18] z-20 hidden sm:block">
                  <img
                    src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80"
                    alt="Resident Mobile App"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60 p-2.5 flex flex-col justify-between">
                    <div className="h-3 w-16 bg-black rounded-full mx-auto"></div>
                    <div className="text-center text-white">
                      <span className="text-[7px] text-[#C5A880] tracking-widest block">RESIDENT APP</span>
                      <span className="text-[10px] font-serif block">Pay Monthly Rent</span>
                      <span className="text-[8px] text-slate-300">UPI &middot; Cards &middot; Receipts</span>
                    </div>
                    <Link
                      href={destinationUrl}
                      className="w-full py-1 bg-[#C5A880] text-[#070F15] text-[9px] font-bold rounded-lg text-center block"
                    >
                      Pay Rent (₹8,000)
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. OUR ROOMS & SUITES (Warm Light Cream Section)              */}
      {/* ============================================================ */}
      <section id="rooms" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A88455] uppercase block mb-2 font-sans">
                OUR ROOMS &amp; SHARING OPTIONS
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#121A20] tracking-tight">
                Comfort &amp; Elegance in Every Room
              </h2>
              <p className="text-sm text-slate-600 max-w-md mt-3 font-light leading-relaxed">
                Thoughtfully furnished rooms designed for focus and relaxation, with ergonomic study desks, 
                high-speed WiFi, attached washrooms, and daily housekeeping.
              </p>
            </div>
            <Link
              href={destinationUrl}
              className="mt-6 md:mt-0 inline-flex items-center gap-1.5 px-5 py-2.5 border border-slate-300 hover:border-[#C5A880] text-xs font-semibold tracking-wider text-slate-800 rounded-full hover:bg-white transition-all shadow-sm"
            >
              <span>View All Beds</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#C5A880]" />
            </Link>
          </div>

          {/* 3 Room Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {roomCards.map((room, idx) => (
              <div 
                key={idx}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-200/80 group flex flex-col"
              >
                {/* Room Image */}
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                  <img
                    src={room.image}
                    alt={room.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
                </div>

                {/* Room Info */}
                <div className="p-6 flex flex-col flex-grow justify-between">
                  <div>
                    <h3 className="font-serif text-xl font-bold text-slate-900 mb-1 group-hover:text-[#A88455] transition-colors">
                      {room.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-light mb-6">
                      {room.specs}
                    </p>
                  </div>

                  {/* Price & Action Button */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-xl font-bold text-slate-900 font-serif">{room.price}</span>
                      <span className="text-xs text-slate-500 font-normal">{room.period}</span>
                    </div>

                    <Link
                      href={room.url}
                      className="w-9 h-9 rounded-full bg-[#FAF8F5] group-hover:bg-[#C5A880] text-slate-700 group-hover:text-white flex items-center justify-center transition-all shadow-sm"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. WORLD-CLASS AMENITIES (Deep Slate Navy / Forest Teal)      */}
      {/* ============================================================ */}
      <section id="amenities" className="py-20 bg-[#0A1C24] text-white relative overflow-hidden">
        {/* Subtle Ambient Light */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#C5A880]/10 rounded-full blur-[140px] pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Landscape Terrace & Lounge Photo */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl aspect-[4/3] border border-white/10 group">
                <img
                  src="https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1000&q=80"
                  alt="Coliving Terrace and Common Area"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1C24]/80 via-transparent to-transparent"></div>
              </div>
            </div>

            {/* Right Column: Title & 6 PG Amenities Grid */}
            <div className="lg:col-span-7 lg:pl-6">
              <span className="text-[11px] font-semibold tracking-[0.25em] text-[#C5A880] uppercase block mb-2">
                COLIVING AMENITIES
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-white tracking-tight mb-4">
                World-Class Amenities <br />
                for a Hassle-Free Stay
              </h2>
              <p className="text-sm text-slate-300 font-light max-w-lg leading-relaxed mb-8">
                From chef-curated nutritious meals to biometric night-out safety and high-speed workspaces, 
                everything is designed so you can focus on your studies and work.
              </p>

              {/* 6 Minimalist Luxury Amenities */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 mb-8">
                {amenitiesList.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div key={idx} className="flex flex-col items-start gap-2.5 group">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 group-hover:border-[#C5A880] group-hover:bg-[#C5A880]/15 flex items-center justify-center text-[#C5A880] transition-all">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium text-slate-200 tracking-wide">
                        {item.title}
                      </span>
                    </div>
                  );
                })}
              </div>

              <Link
                href={destinationUrl}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#C5A880] hover:bg-[#B8986E] text-[#070F15] font-semibold text-xs tracking-wider uppercase rounded-full shadow-md transition-all"
              >
                <span>Explore All Facilities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. DINING & MESS EXPERIENCE (Light Cream Clean Section)       */}
      {/* ============================================================ */}
      <section id="dining" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left: Food Photograph with Atmosphere Badge */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden shadow-xl aspect-[4/3] group">
                <img
                  src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80"
                  alt="Hygienic Dining Experience"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                {/* Handwritten Atmosphere Badge Overlay */}
                <div className="absolute top-6 left-6 text-white font-serif italic text-lg sm:text-xl drop-shadow-md">
                  Fresh Food <br />
                  <span className="text-[#E8D7C2]">Great Vibes</span>
                </div>

                {/* View Menu Pill Button */}
                <Link
                  href="/tenant"
                  className="absolute bottom-6 right-6 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center gap-1.5 text-xs shadow-lg hover:scale-105 transition-transform"
                >
                  <Utensils className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>View Menu</span>
                </Link>
              </div>
            </div>

            {/* Right: Mess Content */}
            <div className="lg:col-span-7 lg:pl-8">
              <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A88455] uppercase block mb-2 font-sans">
                DAILY MESS &amp; DINING
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#121A20] tracking-tight mb-4">
                Taste the Extraordinary
              </h2>
              <p className="text-sm text-slate-600 font-light max-w-lg leading-relaxed mb-8">
                Our in-house kitchen prepares 4 balanced, hygienic, and home-style meals daily 
                (Breakfast, Lunch, High-Tea &amp; Dinner) with weekly special menus and fresh ingredients.
              </p>

              <Link
                href="/tenant"
                className="inline-flex items-center gap-2 px-6 py-2.5 border border-slate-300 hover:border-[#C5A880] text-slate-800 hover:text-[#070F15] rounded-full text-xs font-semibold tracking-wider uppercase transition-all hover:bg-[#FAF8F5]"
              >
                <span>View Weekly Mess Menu</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#C5A880]" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. RESIDENT REVIEWS SECTION                                  */}
      {/* ============================================================ */}
      <section id="reviews" className="py-20 bg-[#FAF8F5] border-t border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Title */}
            <div className="lg:col-span-4">
              <span className="text-[11px] font-semibold tracking-[0.25em] text-[#A88455] uppercase block mb-2">
                RESIDENT EXPERIENCES
              </span>
              <h2 className="text-3xl sm:text-4xl font-serif text-[#121A20] tracking-tight mb-2">
                What Our Residents Say
              </h2>
              <p className="text-xs text-slate-500 font-light">
                Real experiences. Genuine words.
              </p>
            </div>

            {/* 2 Testimonials */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Testimonial 1 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 text-[#C5A880] mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#C5A880]" />
                    ))}
                  </div>
                  <p className="text-xs text-slate-700 italic leading-relaxed mb-6 font-light">
                    &ldquo;Moving to a new city was scary, but living here feels just like home. Super fast internet for my WFH setup and the food is delicious!&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80"
                    alt="Ananya Sharma"
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Ananya Sharma</h4>
                    <span className="text-[10px] text-slate-400">Software Engineer</span>
                  </div>
                </div>
              </div>

              {/* Testimonial 2 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1 text-[#C5A880] mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#C5A880]" />
                    ))}
                  </div>
                  <p className="text-xs text-slate-700 italic leading-relaxed mb-6 font-light">
                    &ldquo;The best PG I&apos;ve ever stayed at. Everything is hassle-free, from instant UPI rent payment receipts to 24/7 gate security.&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
                    alt="Rohan Verma"
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Rohan Verma</h4>
                    <span className="text-[10px] text-slate-400">Management Consultant</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. MANAGEMENT PORTAL QUICK LAUNCH (For Owners, Wardens, Staff) */}
      {/* ============================================================ */}
      <section className="py-14 bg-[#0D1820] text-white border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <span className="text-[10px] font-semibold tracking-widest text-[#C5A880] uppercase block">
                PG OPERATING PLATFORM ACCESS
              </span>
              <h3 className="text-xl font-serif text-white mt-1">
                Property Portals &amp; Management Dashboard
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/owner"
                className="px-4 py-2 bg-white/10 hover:bg-[#C5A880] hover:text-[#070F15] rounded-xl text-xs font-semibold tracking-wide border border-white/15 transition-all flex items-center gap-1.5"
              >
                <span>Owner Portal</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/warden"
                className="px-4 py-2 bg-white/10 hover:bg-[#C5A880] hover:text-[#070F15] rounded-xl text-xs font-semibold tracking-wide border border-white/15 transition-all flex items-center gap-1.5"
              >
                <span>Warden Console</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/tenant"
                className="px-4 py-2 bg-white/10 hover:bg-[#C5A880] hover:text-[#070F15] rounded-xl text-xs font-semibold tracking-wide border border-white/15 transition-all flex items-center gap-1.5"
              >
                <span>Resident App</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/onboarding"
                className="px-4 py-2 bg-[#C5A880] text-[#070F15] hover:bg-[#B8986E] rounded-xl text-xs font-bold tracking-wide transition-all"
              >
                Register New PG
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. FOOTER (Dark Obsidian Luxury Theme)                       */}
      {/* ============================================================ */}
      <footer className="bg-[#050B0F] text-slate-400 py-12 border-t border-white/5 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-white/10">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#C5A880] flex items-center justify-center text-[#070F15] font-bold">
                <Building2 className="w-4 h-4 text-[#070F15]" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif font-bold text-white text-base tracking-widest uppercase">
                  HAVEN LIVING
                </span>
                <span className="text-[8px] text-[#C5A880] tracking-[0.2em] uppercase">
                  PG &amp; COLIVING PLATFORM
                </span>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-slate-300">
              <Link href="#home" className="hover:text-white transition-colors">Home</Link>
              <Link href="#rooms" className="hover:text-white transition-colors">Rooms &amp; Sharing</Link>
              <Link href="#amenities" className="hover:text-white transition-colors">Amenities</Link>
              <Link href="#dining" className="hover:text-white transition-colors">Daily Mess</Link>
              <Link href="#reviews" className="hover:text-white transition-colors">Reviews</Link>
              <Link href="/auth/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-4 text-slate-400">
              <span className="w-7 h-7 rounded-full bg-white/5 hover:bg-[#C5A880] hover:text-[#070F15] flex items-center justify-center cursor-pointer transition-colors">f</span>
              <span className="w-7 h-7 rounded-full bg-white/5 hover:bg-[#C5A880] hover:text-[#070F15] flex items-center justify-center cursor-pointer transition-colors">ig</span>
              <span className="w-7 h-7 rounded-full bg-white/5 hover:bg-[#C5A880] hover:text-[#070F15] flex items-center justify-center cursor-pointer transition-colors">x</span>
              <span className="w-7 h-7 rounded-full bg-white/5 hover:bg-[#C5A880] hover:text-[#070F15] flex items-center justify-center cursor-pointer transition-colors">yt</span>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-4">
            <p>&copy; 2026 Haven Living &middot; PG Manager. All rights reserved.</p>
            <p className="font-serif italic text-slate-400">Smart PG Living &middot; Unmatched Comfort</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
