import React from "react";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, Clock, MapPin, Send, CheckCircle2 } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
// import { BookingLoginModal } from "@/components/BookingLoginModal";
import { patientApi } from "@/lib/patient-api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [langDropOpen, setLangDropOpen] = React.useState(false);
  const { data: settings } = useGetSettings();
  const [activeSection, setActiveSection] = React.useState("home");
  const langDropRef = React.useRef<HTMLDivElement>(null);
  const [bookingModalOpen, setBookingModalOpen] = React.useState(false);
  const [isPatientLoggedIn, setIsPatientLoggedIn] = React.useState(false);
  const [, navigate] = useLocation();
  const [subEmail, setSubEmail] = React.useState("");
  const [subName, setSubName] = React.useState("");
  const [subLoading, setSubLoading] = React.useState(false);
  const [subSuccess, setSubSuccess] = React.useState(false);
  const [subError, setSubError] = React.useState("");

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubError("");
    setSubLoading(true);
    try {
      const res = await fetch(`${BASE}/api/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: subName.trim() || subEmail.split("@")[0], email: subEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok && !data.already_subscribed) throw new Error(data.message || "Failed to subscribe");
      setSubSuccess(true);
      setSubEmail("");
      setSubName("");
    } catch (err: any) {
      setSubError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubLoading(false);
    }
  }

  React.useEffect(() => {
    patientApi.me()
      .then((patient) => setIsPatientLoggedIn(Boolean(patient && patient.id)))
      .catch(() => setIsPatientLoggedIn(false));
  }, []);

  React.useEffect(() => {
    const handler = () => handleBookClick({ preventDefault: () => {} } as any);
    window.addEventListener("open-booking-modal", handler);
    return () => window.removeEventListener("open-booking-modal", handler);
  }, [isPatientLoggedIn]);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (langDropRef.current && !langDropRef.current.contains(e.target as Node)) {
        setLangDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const [isScrolled, setIsScrolled] = React.useState(false);

React.useEffect(() => {
 const handleScroll = () => {
  const ids = [
    "home",
    "about",
    "achievements",
    "services",
    "testimonials",
    "contact",
  ];

  const activePoint = 180;
  let current = "home";

  for (const id of ids) {
    const el = document.getElementById(id);

    if (!el) continue;

    const rect = el.getBoundingClientRect();

    if (rect.top <= activePoint && rect.bottom > activePoint) {
      current = id;
      break;
    }
  }

  setActiveSection(current);
  setIsScrolled(window.scrollY > 10);
};

  window.addEventListener("scroll", handleScroll, { passive: true });

  // Set initial state
  handleScroll();

  return () => window.removeEventListener("scroll", handleScroll);
}, []);

const scrollTo = (
  e: React.MouseEvent<HTMLAnchorElement>,
  id: string
) => {
  e.preventDefault();

  const el = document.getElementById(id);

  if (el) {
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 76,
      behavior: "smooth",
    });
  } else {
    window.location.href = `/#${id}`;
  }

  setIsMobileMenuOpen(false);
  setLangDropOpen(false);
};

  const handleBookClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    if (isPatientLoggedIn) {
      navigate("/portal/dashboard");
    } else {
      navigate("/portal");
    }
  };

  const setLang = (newLang: "en" | "te") => {
    if (lang !== newLang) toggleLanguage();
    setLangDropOpen(false);
  };

  const navLinks = [
    { href: "#home", id: "home", label: tr("nav.home", lang) },
    { href: "#about", id: "about", label: tr("nav.about", lang) },
    { href: "#services", id: "services", label: tr("nav.services", lang) },
    { href: "#achievements", id: "achievements", label: tr("nav.achievements", lang) }, 
    { href: "#contact", id: "contact", label: tr("nav.contact", lang) },
  ];

  return (
    <div className="min-h-screen flex flex-col pt-[75px]">

      {/* ── Fixed Navbar ── */}
<header
  className={cn(
    "fixed top-0 left-0 right-0 z-50 bg-[#FFFFFF] transition-all duration-300",
    isScrolled && "border-b border-[#e2e1de]"
  )}
>
  <div className="relative w-full px-3 sm:px-8 lg:px-13  flex items-center h-[75px] gap-2">

    {/* Logo */}
    <a href="#home" onClick={(e) => scrollTo(e, "home")} className="shrink-0">
      <img
        src={logoImg}
        alt="Susruta Hospital"
        className="h-10 sm:h-10 w-auto max-w-[55vw] sm:max-w-[26vw]  object-contain"
      />
    </a>

    {/* Desktop nav */}
    <nav className="hidden lg:flex items-center gap-0 flex-1 justify-center min-w-0">
      {navLinks.map((link) => (
        <a
          key={link.id}
          href={link.href}
          onClick={(e) => scrollTo(e, link.id)}
          className={cn(
            "px-2 xl:px-3 py-2 rounded-lg font-semibold whitespace-nowrap transition-all font-manrope duration-200 text-[14px] md:text-[15px] leading-[19.92px]",
            activeSection === link.id
              ? "text-[#D95B2F]"
              : "text-[#222D28BF] hover:text-[#D95B2F]"
          )}
          style={{ fontWeight: 600 }}
        >
          {link.label}
        </a>
      ))}
    </nav>

    {/* Right side: Login + Book CTA */}
    <div className="hidden lg:flex items-center gap-1.5 ml-auto flex-shrink-0">
      {/* <a
        href="/portal"
        className="px-4 py-2 rounded-[10px] border border-[#D95B2F] font-manrope text-[#D95B2F] font-semibold text-[15px] hover:bg-[#D95B2F]/5 hover:-translate-y-0.5 transition-all whitespace-nowrap"
      >
        Login
      </a> */}

      <a
        href="/portal"
        onClick={handleBookClick}
        className="px-5 py-2.5 rounded-[10px] bg-[#D95B2F] font-manrope text-[#F5F2E9] font-semibold text-[15px] shadow-md hover:opacity-90 hover:-translate-y-0.5 transition-all whitespace-nowrap inline-flex items-center justify-center cursor-pointer"
      >
        {tr("btn.book", lang)}
      </a>
    </div>

    {/* Mobile hamburger */}
    <button
      className="lg:hidden p-2 text-foreground ml-auto"
      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      aria-label="Toggle menu"
    >
      {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
    </button>
  </div>

  {/* Mobile nav */}
  {isMobileMenuOpen && (
    <div className="relative lg:hidden bg-white border-t border-border shadow-xl py-4 px-4 flex flex-col gap-1">
      {navLinks.map((link) => (
        <a
          key={link.id}
          href={link.href}
          onClick={(e) => scrollTo(e, link.id)}
          className={cn(
            "px-4 py-3 rounded-xl text-base font-medium transition-colors",
            activeSection === link.id
              ? "bg-[#D95B2F]/10 text-[#D95B2F]"
              : "text-foreground/75 hover:bg-muted"
          )}
        >
          {link.label}
        </a>
      ))}

      <div className="mt-2 flex gap-2">
        <a
          href="/portal"
          className="flex-1 px-4 py-3 rounded-xl border border-[#D95B2F]/30 text-[#D95B2F] font-bold text-center"
        >
          Login
        </a>

        <a
          href="/portal"
          onClick={handleBookClick}
          className="flex-1 px-4 py-3 rounded-xl bg-[#D95B2F] text-white font-bold text-center inline-flex items-center justify-center cursor-pointer"
        >
          {tr("btn.book", lang)}
        </a>
      </div>
    </div>
  )}
</header>

      {/* ── Booking Login Modal (commented out) ── */}
      {/* <BookingLoginModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
      /> */}

      {/* ── Page content ── */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* ── Footer ── */}
      <footer className="relative bg-gradient-to-b from-[#FFFFFF] to-[#FFFFFF] text-white/75 overflow-hidden">
        

        <img
          src="/ayurveda-herbs.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-72 xl:w-[380px] pointer-events-none select-none"
          style={{ opacity: 0.12, mixBlendMode: "screen" }}
        />

        <div className="w-full px-3 sm:px-8 lg:px-14 pt-14 pb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 relative z-10">
          {/* Col 1 — About */}
          <div className="space-y-5 sm:col-span-2 lg:col-span-1">
            {/* Original logo colors — no brightness filter */}
            <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto" />

            <p className="text-[14px] md:text-[15px] leading-relaxed text-[#0A2B21]">
              Rooted in the ancient wisdom of Ayurveda, Susruta Hospital brings authentic classical
              treatments to Tirupati under the expert guidance of Dr. P. Murali Krishna — a
              distinguished Gold Medalist physician and former Principal of S.V. Ayurvedic College,
              T.T. Devasthanams.
            </p>

            <div className="space-y-2 pt-1">
              {[
                "B.A.M.S. (Gold Medalist) · M.D. · Ph.D.",
                "Fellow — Rashtriya Ayurveda Vidyapeeth",
                "Governing Body Member, CCRAS New Delhi",
                "30+ Years of Clinical Excellence",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] md:text-[14px] text-[#0A2B21]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#D95B2F]/70 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 2 — Quick Links */}
          <div className="lg:mx-auto">
            <h3 className="font-semibold text-lg text-[#0A2B21] mb-5" style={{ fontFamily: "DM Serif Display" }}>
              {tr("footer.quicklinks", lang)}
            </h3>

            <ul className="space-y-3 text-sm">
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    onClick={(e) => scrollTo(e, link.id)}
                    className="text-[#0A2B21] hover:text-[#E8A87C] transition-colors duration-200 flex items-center gap-2"
                  >
                    <span className="w-1 h-1 rounded-full bg-[#D95B2F]/50" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Contact */}
          <div>
            <h3 className="font-semibold text-lg text-[#0A2B21] mb-5" style={{ fontFamily: "DM Serif Display" }}>
              {tr("footer.contact", lang)}
            </h3>

            <ul className="space-y-4 text-sm text-[#0A2B21]">
              <li className="flex gap-3 items-start">
                <MapPin className="shrink-0 mt-0.5 text-[#E8A87C]" size={15} />
                <span>{settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507"}</span>
              </li>

              <li className="flex gap-3 items-center">
                <Phone className="shrink-0 text-[#E8A87C]" size={15} />
                <span>
                  {settings?.clinicPhone1 || "9492068180"}
                  {settings?.clinicPhone2 ? `, ${settings.clinicPhone2}` : ""}
                </span>
              </li>

              <li className="flex gap-3 items-start">
                <Clock className="shrink-0 mt-0.5 text-[#E8A87C]" size={15} />
                <span>{settings?.workingHours || "Mon–Sat: 10AM–1PM, 6PM–10PM | Sun: 10AM–1PM"}</span>
              </li>
            </ul>
          </div>

          {/* Col 4 — Newsletter */}
          <div>
            <h3 className="font-semibold text-lg text-[#0A2B21] mb-2" style={{ fontFamily: "DM Serif Display" }}>
              Stay Connected
            </h3>

            <p className="text-sm text-[#0A2B21] leading-relaxed mb-4">
              Get Ayurvedic wellness tips, seasonal health guides, and clinic updates straight to your inbox.
            </p>

            {subSuccess ? (
              <div className="flex items-start gap-2.5 bg-[#D95B2F]/15 border border-[#D95B2F]/30 rounded-xl px-4 py-3.5">
                <CheckCircle2 size={16} className="text-[#E8A87C] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#E8A87C]">You're subscribed!</p>
                  <p className="text-sm text-[#0A2B21] mt-0.5">Thank you for joining. We'll be in touch.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full bg-[#0A2B21]/5 border border-[#0A2B21]/15 rounded-xl px-3.5 py-2.5 text-sm text-[#0A2B21] placeholder:text-[#0A2B21]/40 focus:outline-none focus:border-[#D95B2F]/60 focus:bg-white/8 transition-all"
                />

                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Your email address"
                    value={subEmail}
                    onChange={(e) => setSubEmail(e.target.value)}
                    className="flex-1 min-w-0 bg-[#0A2B21]/5 border border-[#0A2B21]/15 rounded-xl px-3.5 py-2.5 text-sm text-[#0A2B21] placeholder:text-[#0A2B21]/40 focus:outline-none focus:border-[#D95B2F]/60 focus:bg-white/8 transition-all"
                  />

                  <button
                    type="submit"
                    disabled={subLoading}
                    className="shrink-0 bg-[#D95B2F] hover:bg-[#C44E24] text-white rounded-xl px-3.5 py-2.5 transition-colors disabled:opacity-60 flex items-center gap-1.5 text-sm font-semibold"
                  >
                    {subLoading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>

                {subError && <p className="text-xs text-red-400">{subError}</p>}

                <p className="text-sm text-[#0A2B21] leading-snug">
                  No spam, ever. Unsubscribe at any time.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Bottom bar */}
<div className="w-full px-4 sm:px-8 lg:px-14 py-5 border-t border-[#0A2B21]/10 relative z-10">
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-[#0A2B21] text-center">
    
    {/* Copyright */}
    <p>
      © {new Date().getFullYear()} Susruta Hospital, Tirupati. All rights reserved.
      {" "}Designed with Gratitude from{" "}
      <a
        href="https://myrsv.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-[#E8A87C] underline underline-offset-2 transition-colors"
      >
        RSV Infotech Pte. Ltd.
      </a>
    </p>

<div>

    {/* Terms */}

    <a
      href={`${BASE}/terms`}
      className="hover:text-[#E8A87C] transition-colors"
    >
      Terms &amp; Conditions
    </a>

    <span className="opacity-50 px-3">|</span>

    {/* Medical Disclaimer */}
    <a
      href={`${BASE}/medical-disclaimer`}
      className="hover:text-[#E8A87C] transition-colors"
    >
      Medical Disclaimer
    </a>

    <span className="opacity-50 px-3">|</span>

    {/* Privacy Policy */}
    <a
      href={`${BASE}/privacy-policy`}
      className="hover:text-[#E8A87C] transition-colors"
    >
      Privacy Policy
    </a>
</div>
  </div>
</div>
      </footer>
    </div>
  );
}