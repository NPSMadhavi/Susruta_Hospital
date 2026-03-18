import React from "react";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, Clock, MapPin } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";
import { Link } from "wouter";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { data: settings } = useGetSettings();
  const [activeSection, setActiveSection] = React.useState("home");

  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;

  const navLinks = [
    { href: "#home", id: "home", label: t("nav.home") },
    { href: "#about", id: "about", label: t("nav.about") },
    { href: "#achievements", id: "achievements", label: t("nav.achievements") },
    { href: "#services", id: "services", label: t("nav.services") },
    { href: "#appointments", id: "appointments", label: t("nav.appointments") },
    ...(settings?.testimonialsEnabled ? [{ href: "#testimonials", id: "testimonials", label: t("nav.testimonials") }] : []),
    { href: "#contact", id: "contact", label: t("nav.contact") },
  ];

  React.useEffect(() => {
    const handleScroll = () => {
      const sections = ["home", "about", "achievements", "services", "appointments", "testimonials", "contact"];
      let current = "home";
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) {
          current = id;
        }
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
      const offset = 88;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground py-2 px-4 text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            <span className="flex items-center gap-1.5"><Phone size={13} /> +91 9492068180</span>
            <span className="hidden sm:flex items-center gap-1.5"><span className="opacity-40">|</span></span>
            <span className="flex items-center gap-1.5"><Clock size={13} /> {settings?.workingHours || "Mon-Sat: 10AM–1PM, 6PM–10PM"}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors font-semibold tracking-wide"
            >
              {lang === "en" ? "తెలుగు" : "English"}
            </button>
            <Link href="/admin" className="text-primary-foreground/80 hover:text-white transition-colors">
              {t("nav.admin")}
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky Navbar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[72px]">
            {/* Logo image only — the logo already contains the hospital name text */}
            <a href="#home" onClick={(e) => scrollTo(e, "home")} className="flex-shrink-0">
              <img
                src={logoImg}
                alt="Susruta Hospital"
                className="h-12 w-auto object-contain"
              />
            </a>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {navLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  onClick={(e) => scrollTo(e, link.id)}
                  className={cn(
                    "px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap",
                    activeSection === link.id
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/70 hover:bg-muted hover:text-primary"
                  )}
                >
                  {link.label}
                </a>
              ))}
              <a
                href="#appointments"
                onClick={(e) => scrollTo(e, "appointments")}
                className="ml-3 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all text-sm whitespace-nowrap"
              >
                {t("btn.book")}
              </a>
            </nav>

            {/* Mobile Menu Toggle */}
            <button
              className="lg:hidden p-2 text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-border shadow-xl py-4 px-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                onClick={(e) => scrollTo(e, link.id)}
                className={cn(
                  "px-4 py-3 rounded-xl text-base font-medium transition-colors",
                  activeSection === link.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted"
                )}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#appointments"
              onClick={(e) => scrollTo(e, "appointments")}
              className="mt-2 px-4 py-3 rounded-xl bg-primary text-white font-bold text-center"
            >
              {t("btn.book")}
            </a>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Footer */}
      <footer className="bg-[#1a2e1a] text-white/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <img src={logoImg} alt="Logo" className="h-10 w-auto brightness-0 invert mb-4" />
            <p className="text-sm leading-relaxed text-white/60">
              {lang === "en"
                ? "Dedicated to providing authentic Ayurvedic treatments with modern medical standards under the expert guidance of Dr. P. Murali Krishna."
                : "డాక్టర్ పి. మురళీకృష్ణ గారి నిపుణుల మార్గదర్శకత్వంలో ప్రామాణికమైన ఆయుర్వేద చికిత్సలను అందించడానికి అంకితం చేయబడింది."}
            </p>
          </div>
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-4">
              {lang === "en" ? "Quick Links" : "శీఘ్ర లింకులు"}
            </h3>
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
            <h3 className="font-serif font-semibold text-lg text-white mb-4">
              {lang === "en" ? "Contact Info" : "సంప్రదింపు సమాచారం"}
            </h3>
            <ul className="space-y-4 text-sm text-white/70">
              <li className="flex gap-3 items-start">
                <MapPin className="shrink-0 mt-0.5 text-green-400" size={16} />
                <span>{settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507"}</span>
              </li>
              <li className="flex gap-3 items-center">
                <Phone className="shrink-0 text-green-400" size={16} />
                <span>
                  {settings?.clinicPhone1 || "9492068180"}
                  {settings?.clinicPhone2 ? `, ${settings.clinicPhone2}` : ""}
                </span>
              </li>
              <li className="flex gap-3 items-center">
                <Clock className="shrink-0 text-green-400" size={16} />
                <span>{settings?.workingHours || "Mon-Sat: 10AM–1PM, 6PM–10PM | Sun: 10AM–1PM"}</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t border-white/10 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Susruta Hospital, Tirupati. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
