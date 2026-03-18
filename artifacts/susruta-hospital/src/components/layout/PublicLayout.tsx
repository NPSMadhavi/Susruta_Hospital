import React from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Menu, X, Phone, MapPin, Clock } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useGetSettings } from "@workspace/api-client-react";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { lang, toggleLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { data: settings } = useGetSettings();

  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;

  const navLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/about", label: t("nav.about") },
    { href: "/achievements", label: t("nav.achievements") },
    { href: "/services", label: t("nav.services") },
    { href: "/appointments", label: t("nav.appointments") },
  ];

  if (settings?.testimonialsEnabled) {
    navLinks.push({ href: "/testimonials", label: t("nav.testimonials") });
  }
  navLinks.push({ href: "/contact", label: t("nav.contact") });

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground py-2 px-4 text-xs sm:text-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Phone size={14} /> +91 9492068180</span>
            <span className="flex items-center gap-1.5"><Clock size={14} /> {settings?.workingHours || "Mon-Sat: 9AM - 8PM"}</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleLanguage}
              className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors font-medium"
            >
              {lang === 'en' ? 'తెలుగు' : 'English'}
            </button>
            <Link href="/admin" className="text-primary-foreground/80 hover:text-white transition-colors">
              {t("nav.admin")}
            </Link>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <img src={logoImg} alt="Susruta Hospital Logo" className="h-12 w-auto object-contain transition-transform group-hover:scale-105" />
              <div className="hidden sm:block">
                <h1 className="font-serif font-bold text-xl text-primary leading-tight">
                  {t("hospital.name")}
                </h1>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("hospital.tagline")}
                </p>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                    location === link.href 
                      ? "bg-secondary text-primary" 
                      : "text-foreground/80 hover:bg-muted hover:text-primary"
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link 
                href="/appointments" 
                className="ml-4 px-6 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 hover:-translate-y-0.5 transition-all"
              >
                {t("btn.book")}
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden p-2 text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-white border-b border-border shadow-xl py-4 px-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "px-4 py-3 rounded-xl text-base font-medium",
                  location === link.href 
                    ? "bg-secondary text-primary" 
                    : "text-foreground/80 hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-foreground text-white/80 py-12 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src={logoImg} alt="Logo" className="h-10 w-auto brightness-0 invert" />
              <h2 className="font-serif font-bold text-xl text-white">{t("hospital.name")}</h2>
            </div>
            <p className="text-sm leading-relaxed mb-6">
              {lang === 'en' 
                ? "Dedicated to providing authentic Ayurvedic treatments with modern medical standards under the expert guidance of Dr. P. Murali Krishna."
                : "డాక్టర్ పి. మురళీకృష్ణ గారి నిపుణుల మార్గదర్శకత్వంలో ఆధునిక వైద్య ప్రమాణాలతో ప్రామాణికమైన ఆయుర్వేద చికిత్సలను అందించడానికి అంకితం చేయబడింది."}
            </p>
          </div>
          
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/" className="hover:text-primary-foreground transition-colors">{t("nav.home")}</Link></li>
              <li><Link href="/about" className="hover:text-primary-foreground transition-colors">{t("nav.about")}</Link></li>
              <li><Link href="/services" className="hover:text-primary-foreground transition-colors">{t("nav.services")}</Link></li>
              <li><Link href="/contact" className="hover:text-primary-foreground transition-colors">{t("nav.contact")}</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-serif font-semibold text-lg text-white mb-4">Contact Info</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3 items-start">
                <MapPin className="shrink-0 mt-0.5" size={18} />
                <span>{settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507"}</span>
              </li>
              <li className="flex gap-3 items-center">
                <Phone className="shrink-0" size={18} />
                <span>{settings?.clinicPhone1 || "9492068180"} {settings?.clinicPhone2 ? `, ${settings?.clinicPhone2}` : ''}</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-white/10 text-center text-xs text-white/50">
          © {new Date().getFullYear()} Susruta Hospital. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
