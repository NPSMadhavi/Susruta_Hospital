import React from "react";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, Clock, MapPin } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { BookingLoginModal } from "@/components/BookingLoginModal";
import { BookingWizard } from "@/pages/portal/BookingWizard";
import { patientApi } from "@/lib/patient-api";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [langDropOpen, setLangDropOpen] = React.useState(false);
  const { data: settings } = useGetSettings();
  const [activeSection, setActiveSection] = React.useState("home");
  const langDropRef = React.useRef<HTMLDivElement>(null);
  const [bookingModalOpen, setBookingModalOpen] = React.useState(false);
  const [showBookingWizard, setShowBookingWizard] = React.useState(false);
  const [loggedInPatient, setLoggedInPatient] = React.useState<{ id: number; name: string; phone?: string } | null>(null);
  const [, navigate] = useLocation();

  React.useEffect(() => {
    patientApi.me().then((data: any) => setLoggedInPatient({ id: data.id, name: data.name, phone: data.phone ?? undefined })).catch(() => {});
  }, []);

  React.useEffect(() => {
    const handler = () => handleBookClick({ preventDefault: () => {} } as any);
    window.addEventListener("open-booking-modal", handler);
    return () => window.removeEventListener("open-booking-modal", handler);
  }, [loggedInPatient]);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (langDropRef.current && !langDropRef.current.contains(e.target as Node)) {
        setLangDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      const ids = ["home", "about", "achievements", "services", "testimonials", "contact"];
      let current = "home";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: "smooth" });
    } else {
      window.location.href = `/#${id}`;
    }
    setIsMobileMenuOpen(false);
    setLangDropOpen(false);
  };

  const handleBookClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    if (loggedInPatient) {
      setShowBookingWizard(true);
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
    { href: "#achievements", id: "achievements", label: tr("nav.achievements", lang) },
    { href: "#services", id: "services", label: tr("nav.services", lang) },
    ...(settings?.testimonialsEnabled
      ? [{ href: "#testimonials", id: "testimonials", label: tr("nav.testimonials", lang) }]
      : []),
    { href: "#contact", id: "contact", label: tr("nav.contact", lang) },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans">

      {/* ── Top info bar ── */}
      <div className="bg-primary text-primary-foreground py-1.5 text-sm">
        <div className="w-full px-4 sm:px-8 lg:px-14 flex flex-col sm:flex-row justify-between items-center gap-1">
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            <span className="flex items-center gap-1.5"><Phone size={13} /> +91 9492068180</span>
            <span className="hidden sm:inline opacity-25">|</span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <Clock size={13} /> {settings?.workingHours || "Mon–Sat: 10AM–1PM, 6PM–10PM · Sun: 10AM–1PM"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Sticky Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/96 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="w-full px-4 sm:px-8 lg:px-14 flex items-center h-14 sm:h-16 lg:h-[72px] gap-3">

          {/* Logo */}
          <a href="#home" onClick={(e) => scrollTo(e, "home")} className="shrink-0">
            <img src={logoImg} alt="Susruta Hospital" className="h-8 sm:h-9 lg:h-12 w-auto object-contain" />
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
            {navLinks.map((link) => (
              <a
                key={link.id} href={link.href}
                onClick={(e) => scrollTo(e, link.id)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-200",
                  activeSection === link.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/60 hover:bg-muted hover:text-primary"
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right side: Book CTA */}
          <div className="hidden lg:flex items-center gap-3 ml-auto flex-shrink-0">

            {/* Book Appointment button */}
            <button
              onClick={handleBookClick}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all whitespace-nowrap"
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
          <div className="lg:hidden bg-white border-t border-border shadow-xl py-4 px-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.id} href={link.href}
                onClick={(e) => scrollTo(e, link.id)}
                className={cn(
                  "px-4 py-3 rounded-xl text-base font-medium transition-colors",
                  activeSection === link.id ? "bg-primary/10 text-primary" : "text-foreground/75 hover:bg-muted"
                )}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={handleBookClick}
              className="mt-2 px-4 py-3 rounded-xl bg-primary text-white font-bold text-center w-full"
            >
              {tr("btn.book", lang)}
            </button>
          </div>
        )}
      </header>

      {/* ── Booking Login Modal (for guests / unauthenticated) ── */}
      <BookingLoginModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        onContinueAsGuest={() => { setBookingModalOpen(false); navigate("/appointments"); }}
      />

      {/* ── BookingWizard popup for already-logged-in patients ── */}
      {showBookingWizard && (
        <BookingWizard
          patient={loggedInPatient}
          onClose={() => setShowBookingWizard(false)}
          onSuccess={() => setShowBookingWizard(false)}
        />
      )}

      {/* ── Page content ── */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* ── Footer ── */}
      <footer className="relative bg-[#162814] text-white/80 pt-14 pb-6 overflow-hidden">

        <img
          src="/ayurveda-herbs.png" alt="" aria-hidden="true"
          className="absolute bottom-0 right-0 w-72 xl:w-[380px] pointer-events-none select-none"
          style={{ opacity: 0.22, mixBlendMode: "screen" }}
        />

        <div className="w-full px-4 sm:px-8 lg:px-14 grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
          <div className="space-y-5">
            <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto brightness-0 invert" />
            <p className="text-sm leading-relaxed text-white/50">
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
                <div key={i} className="flex items-start gap-2 text-xs text-white/40">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-green-400/50 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div>
              <h3 className="font-serif font-semibold text-lg text-white mb-4">{tr("footer.quicklinks", lang)}</h3>
              <ul className="space-y-2 text-sm">
                {navLinks.map((link) => (
                  <li key={link.id}>
                    <a href={link.href} onClick={(e) => scrollTo(e, link.id)} className="hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-4">{tr("footer.contact", lang)}</h3>
            <ul className="space-y-4 text-sm text-white/60">
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
        </div>

        <div className="w-full px-4 sm:px-8 lg:px-14 mt-10 pt-6 border-t border-white/10 text-center text-base text-white/40 relative z-10">
          <p>
            © {new Date().getFullYear()} Susruta Hospital, Tirupati. All rights reserved. &nbsp;·&nbsp; Designed with Gratitude from{" "}
            <a href="https://myrsv.com" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
              RSV Infotech Pte. Ltd.
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
