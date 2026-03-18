import React from "react";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, Clock, MapPin, Globe, ChevronDown } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";
import { Link } from "wouter";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [langDropOpen, setLangDropOpen] = React.useState(false);
  const { data: settings } = useGetSettings();
  const [activeSection, setActiveSection] = React.useState("home");
  const langDropRef = React.useRef<HTMLDivElement>(null);

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
      const ids = ["home", "about", "achievements", "services", "appointments", "testimonials", "contact"];
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
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: "smooth" });
    setIsMobileMenuOpen(false);
    setLangDropOpen(false);
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
    { href: "#appointments", id: "appointments", label: tr("nav.appointments", lang) },
    ...(settings?.testimonialsEnabled
      ? [{ href: "#testimonials", id: "testimonials", label: tr("nav.testimonials", lang) }]
      : []),
    { href: "#contact", id: "contact", label: tr("nav.contact", lang) },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans">

      {/* ── Top info bar ── */}
      <div className="bg-primary text-primary-foreground py-1.5 text-xs">
        <div className="w-full px-4 sm:px-8 lg:px-14 flex flex-col sm:flex-row justify-between items-center gap-1">
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            <span className="flex items-center gap-1.5"><Phone size={11} /> +91 9492068180</span>
            <span className="hidden sm:inline opacity-25">|</span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <Clock size={11} /> {settings?.workingHours || "Mon–Sat: 10AM–1PM, 6PM–10PM · Sun: 10AM–1PM"}
            </span>
          </div>
          <Link href="/admin" className="text-primary-foreground/65 hover:text-white transition-colors hidden sm:block">
            {tr("nav.admin", lang)}
          </Link>
        </div>
      </div>

      {/* ── Sticky Navbar — full viewport width, logo extreme left ── */}
      <header className="sticky top-0 z-50 bg-white/96 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="w-full px-4 sm:px-8 lg:px-14 flex items-center h-[72px] gap-4">

          {/* Logo — pinned to extreme left edge */}
          <a href="#home" onClick={(e) => scrollTo(e, "home")} className="flex-shrink-0">
            <img src={logoImg} alt="Susruta Hospital" className="h-16 w-auto object-contain" />
          </a>

          {/* Desktop nav — centred in the remaining space */}
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

          {/* Right side: language dropdown + CTA */}
          <div className="hidden lg:flex items-center gap-3 ml-auto flex-shrink-0">

            {/* Language dropdown */}
            <div className="relative" ref={langDropRef}>
              <button
                onClick={() => setLangDropOpen(!langDropOpen)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-foreground/60 hover:bg-muted hover:text-primary transition-colors"
              >
                <Globe size={14} />
                <span>{lang === "en" ? "English" : "తెలుగు"}</span>
                <ChevronDown
                  size={12}
                  className={cn("transition-transform duration-200", langDropOpen && "rotate-180")}
                />
              </button>

              {langDropOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-border py-1 w-36 z-50">
                  <button
                    onClick={() => setLang("en")}
                    className={cn(
                      "w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-muted flex items-center gap-2",
                      lang === "en" ? "text-primary font-semibold" : "text-foreground/70"
                    )}
                  >
                    🇬🇧 English
                  </button>
                  <button
                    onClick={() => setLang("te")}
                    className={cn(
                      "w-full px-4 py-2.5 text-sm text-left transition-colors hover:bg-muted flex items-center gap-2",
                      lang === "te" ? "text-primary font-semibold" : "text-foreground/70"
                    )}
                  >
                    🇮🇳 తెలుగు
                  </button>
                </div>
              )}
            </div>

            {/* Book button */}
            <a
              href="#appointments"
              onClick={(e) => scrollTo(e, "appointments")}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all whitespace-nowrap"
            >
              {tr("btn.book", lang)}
            </a>
          </div>

          {/* Mobile toggle */}
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
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { if (lang !== "en") toggleLanguage(); setIsMobileMenuOpen(false); }}
                className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors",
                  lang === "en" ? "bg-primary text-white border-primary" : "border-border text-foreground/65")}
              >🇬🇧 English</button>
              <button
                onClick={() => { if (lang !== "te") toggleLanguage(); setIsMobileMenuOpen(false); }}
                className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors",
                  lang === "te" ? "bg-primary text-white border-primary" : "border-border text-foreground/65")}
              >🇮🇳 తెలుగు</button>
            </div>
            <a
              href="#appointments" onClick={(e) => scrollTo(e, "appointments")}
              className="mt-2 px-4 py-3 rounded-xl bg-primary text-white font-bold text-center"
            >
              {tr("btn.book", lang)}
            </a>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* ── Footer ── */}
      <footer className="relative bg-[#162814] text-white/80 py-14 overflow-hidden">

        {/* Ayurvedic herbs image — bottom right decorative */}
        <img
          src="/ayurveda-herbs.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-72 xl:w-[380px] pointer-events-none select-none"
          style={{ opacity: 0.22, mixBlendMode: "screen" }}
        />

        <div className="w-full px-4 sm:px-8 lg:px-14 grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
          <div>
            <img src={logoImg} alt="Susruta Hospital" className="h-10 w-auto brightness-0 invert mb-4" />
            <p className="text-sm leading-relaxed text-white/50">{tr("footer.desc", lang)}</p>
          </div>
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

        <div className="w-full px-4 sm:px-8 lg:px-14 mt-10 pt-6 border-t border-white/10 text-center text-sm text-white/40 relative z-10 space-y-1.5">
          <p>© {new Date().getFullYear()} Susruta Hospital, Tirupati. All rights reserved.</p>
          <p>
            Designed with Gratitude from{" "}
            <a href="https://myrsv.com" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white underline underline-offset-2 transition-colors">
              RSV Infotech Pte. Ltd.
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
