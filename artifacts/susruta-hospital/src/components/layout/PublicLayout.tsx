import React from "react";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, Clock, MapPin, Send, CheckCircle2 } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { BookingLoginModal } from "@/components/BookingLoginModal";
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
      const res = await fetch(`${BASE}/api/subscribers/subscribe`, {
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
    patientApi.me().then(() => setIsPatientLoggedIn(true)).catch(() => {});
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
      setBookingModalOpen(true);
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
  <div className="relative w-full px-3 sm:px-5 lg:px-6 xl:px-10 2xl:px-14 flex items-center h-[75px] gap-2">

    {/* Logo */}
    <a href="#home" onClick={(e) => scrollTo(e, "home")} className="shrink-0">
      <img
        src={logoImg}
        alt="Susruta Hospital"
        className="h-8 sm:h-9 lg:h-10 xl:h-11 w-auto max-w-[32vw] object-contain"
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
      <a
        href="/portal"
        className="px-4 py-2 rounded-[10px] border border-[#D95B2F] font-manrope text-[#D95B2F] font-semibold text-[15px] hover:bg-[#D95B2F]/5 hover:-translate-y-0.5 transition-all whitespace-nowrap"
      >
        Login
      </a>

      <button
        onClick={handleBookClick}
        className="px-5 py-2.5 rounded-[10px] bg-[#D95B2F] font-manrope text-[#F5F2E9] font-semibold text-[15px] shadow-md hover:opacity-90 hover:-translate-y-0.5 transition-all whitespace-nowrap"
      >
        {tr("btn.book", lang)}
      </button>
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
              ? "bg-primary/10 text-primary"
              : "text-foreground/75 hover:bg-muted"
          )}
        >
          {link.label}
        </a>
      ))}

      <div className="mt-2 flex gap-2">
        <a
          href="/portal"
          className="flex-1 px-4 py-3 rounded-xl border border-primary/30 text-primary font-bold text-center"
        >
          Login
        </a>

        <button
          onClick={handleBookClick}
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold text-center"
        >
          {tr("btn.book", lang)}
        </button>
      </div>
    </div>
  )}
</header>


      {/* ── Booking Login Modal ── */}
      <BookingLoginModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
      />

      {/* ── Page content ── */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* ── Footer ── */}
      <footer className="relative bg-[#15392D] text-white/80 pt-14 pb-6 overflow-hidden">

        <img
          src="/ayurveda-herbs.png" alt="" aria-hidden="true"
          className="absolute bottom-0 right-0 w-72 xl:w-[380px] pointer-events-none select-none"
          style={{ opacity: 0.22, mixBlendMode: "screen" }}
        />

        <div className="w-full px-4 sm:px-8 lg:px-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 relative z-10">
          {/* Col 1 — About */}
          <div className="space-y-5 sm:col-span-2 lg:col-span-1  ">
            <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto brightness-0 invert" />
            <p className="text-[14px] md:text-[16px]  leading-relaxed text-white/80">
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
                <div key={i} className="flex items-start gap-2 font-dm-sans text-[13px] md:text-[15px] text-white/80">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-green-400/50 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Col 2 — Quick Links */}
                  <div className="lg:mx-auto">
            <h3 className=" font-semibold text-lg text-white mb-4 "style={{ fontFamily: 'DM Serif Display',}}>
              {tr("footer.quicklinks", lang)}
            </h3>

            <ul className="space-y-2 text-sm">
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    onClick={(e) => scrollTo(e, link.id)}
                    className="hover:text-green-400 text-white/80 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Contact */}
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-4"style={{ fontFamily: 'DM Serif Display',}}>{tr("footer.contact", lang)}</h3>
            <ul className="space-y-4 text-sm text-white/80">
              <li className="flex gap-3 items-start">
                <MapPin className="shrink-0 mt-0.5 text-green-400" size={15} />
                <span>{settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507"}</span>
              </li>
              <li className="flex gap-3 items-center">
                <Phone className="shrink-0 text-green-400" size={15} />
                <span>
                  {settings?.clinicPhone1 || "9492068180"}
                  {settings?.clinicPhone2 ? `, ${settings.clinicPhone2}` : ""}
                </span>
              </li>
              <li className="flex gap-3 items-start">
                <Clock className="shrink-0 mt-0.5 text-green-400" size={15} />
                <span>{settings?.workingHours || "Mon–Sat: 10AM–1PM, 6PM–10PM | Sun: 10AM–1PM"}</span>
              </li>
            </ul>
          </div>

          {/* Col 4 — Newsletter */}
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-2"style={{ fontFamily: 'DM Serif Display',}}>Stay Connected</h3>
            <p className="text-sm text-white/80 leading-relaxed mb-4">
              Get Ayurvedic wellness tips, seasonal health guides, and clinic updates straight to your inbox.
            </p>

            {subSuccess ? (
              <div className="flex items-start gap-2.5 bg-green-900/40 border border-green-600/30 rounded-xl px-4 py-3.5">
                <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-300">You're subscribed!</p>
                  <p className="text-xs text-white/80 mt-0.5">Thank you for joining. We'll be in touch.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  className="w-full bg-white/8 border border-white/55 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-green-500/60 focus:bg-white/10 transition-all"
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Your email address"
                    value={subEmail}
                    onChange={e => setSubEmail(e.target.value)}
                    className="flex-1 min-w-0 bg-white/8 border border-white/55 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-green-500/60 focus:bg-white/10 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={subLoading}
                    className="shrink-0 bg-green-700 hover:bg-green-600 text-white rounded-xl px-3.5 py-2.5 transition-colors disabled:opacity-60 flex items-center gap-1.5 text-sm font-semibold"
                  >
                    {subLoading
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Send size={14} />
                    }
                  </button>
                </div>
                {subError && <p className="text-xs text-red-400">{subError}</p>}
                <p className="text-sm text-white/80 leading-snug">
                  No spam, ever. Unsubscribe at any time.
                </p>
              </form>
            )}
          </div>
        </div>

        <div className="w-full px-4 sm:px-8 lg:px-14 mt-10 pt-6 border-t border-white/20 relative z-10 flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-white/80">
            <a href={`${BASE}/terms`} className="hover:text-white transition-colors">Terms &amp; Conditions</a>
            <span className="opacity-95">·</span>
            <a href={`${BASE}/medical-disclaimer`} className="hover:text-white transition-colors">Medical Disclaimer</a>
            <span className="opacity-95">·</span>
            <a href={`${BASE}/privacy-policy`} className="hover:text-white transition-colors">Privacy Policy</a>
          </div>
          <p className="text-xs text-white/80 text-center">
            © {new Date().getFullYear()} Susruta Hospital, Tirupati. All rights reserved.  Designed with Gratitude from{" "}{" "}
            <a href="https://myrsv.com" target="_blank" rel="noopener noreferrer" className="text-white/90 hover:text-green-400 underline underline-offset-2 transition-colors">
              RSV Infotech Pte. Ltd.
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
