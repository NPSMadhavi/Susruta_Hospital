import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  useListOpenMonths,
  useGetAvailability,
  useGetSlots,
  useCreateAppointment,
  useGetSettings,
  useListTestimonials,
} from "@workspace/api-client-react";
import {
  Award, Leaf, ShieldCheck, Clock, Trophy, Activity,
  Droplets, Heart, MapPin, Phone, Mail, Star, Quote,
  CheckCircle2, Calendar, Info, ChevronLeft, ChevronRight,
} from "lucide-react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import drPhoto from "@assets/Dr_Murali_Krishna_1773837837953.jpeg";

// ─── Checker grid background image (CSS gradients) ───────────
const CHECKER_BG: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(#2d6a4f 1px, transparent 1px),
    linear-gradient(90deg, #2d6a4f 1px, transparent 1px)
  `,
  backgroundSize: "20px 20px",
};

// ─── Textured section — mouse-only spotlight, clean background ─
function TexturedSection({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const sRef = useRef<HTMLElement>(null);
  const rafRef = useRef<number>();

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!sRef.current) return;
      const rect = sRef.current.getBoundingClientRect();
      sRef.current.style.setProperty("--sx", `${e.clientX - rect.left}px`);
      sRef.current.style.setProperty("--sy", `${e.clientY - rect.top}px`);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!sRef.current) return;
    sRef.current.style.setProperty("--sx", "-999px");
    sRef.current.style.setProperty("--sy", "-999px");
  }, []);

  return (
    <section
      ref={sRef} id={id}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Checker grid — invisible until cursor enters, revealed in spotlight */}
      <div
        style={{
          ...CHECKER_BG,
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.10,
          maskImage: "radial-gradient(circle 200px at var(--sx, -999px) var(--sy, -999px), black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle 200px at var(--sx, -999px) var(--sy, -999px), black 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

// ─── Fluid content container ─────────────────────────────────
function SC({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className={`w-full mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 ${narrow ? "max-w-[900px]" : "max-w-[1440px]"}`}>
      {children}
    </div>
  );
}

// ─── Scroll animation wrapper ─────────────────────────────────
function Reveal({
  children, delay = 0, direction = "up", className = "",
}: {
  children: React.ReactNode; delay?: number;
  direction?: "up" | "left" | "right" | "none"; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      variants={{
        hidden: { opacity: 0, y: direction === "up" ? 40 : 0, x: direction === "left" ? -40 : direction === "right" ? 40 : 0 },
        visible: { opacity: 1, y: 0, x: 0 },
      }}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Section Header ───────────────────────────────────────────
function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <Reveal>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm uppercase tracking-wider mb-4">
          <Leaf size={13} /> {label}
        </div>
        <h2 className="text-3xl md:text-4xl xl:text-5xl font-serif font-bold text-foreground mb-4">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-lg leading-relaxed">{subtitle}</p>}
      </Reveal>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function Home() {
  const { lang } = useLanguage();
  return (
    <PublicLayout>
      <HeroSection lang={lang} />
      <AboutSection lang={lang} />
      <AchievementsSection lang={lang} />
      <ServicesSection lang={lang} />
      <AppointmentsSection lang={lang} />
      <TestimonialsSection lang={lang} />
      <ContactSection lang={lang} />
    </PublicLayout>
  );
}

// ─── HERO ─────────────────────────────────────────────────────
const HERO_TEXTS: Array<{ en: string; te: string }> = [
  { en: "Experience Nature's Touch for Your Health", te: "మీ ఆరోగ్యం కోసం ప్రకృతి స్పర్శను అనుభవించండి" },
  { en: "Heal with Ancient Wisdom & Modern Care", te: "పురాతన జ్ఞానంతో ఆధునిక సంరక్షణతో స్వస్థత పొందండి" },
  { en: "30+ Years of Ayurvedic Excellence", te: "30+ సంవత్సరాల ఆయుర్వేద శ్రేష్ఠత" },
  { en: "Trusted Healing in the Heart of Tirupati", te: "తిరుపతి హృదయంలో విశ్వసనీయ వైద్యం" },
];

function HeroSection({ lang }: { lang: "en" | "te" }) {
  const [textIdx, setTextIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTextIdx((i) => (i + 1) % HERO_TEXTS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: "smooth" });
  };

  return (
    <TexturedSection id="home" className="relative pt-14 pb-20 bg-white">

      <SC>
        <div className="flex flex-col lg:flex-row items-start gap-10 lg:gap-16 xl:gap-20">

          {/* Left: Text */}
          <div className="flex-1 space-y-7 text-center lg:text-left z-10 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-semibold text-sm"
            >
              <Leaf size={15} /> {tr("hero.badge", lang)}
            </motion.div>

            {/* Rotating headline — truly fluid, auto-height */}
            <div className="overflow-hidden" style={{ minHeight: "clamp(5rem, 12vw, 11rem)" }}>
              <AnimatePresence mode="wait">
                <motion.h1
                  key={textIdx}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -32 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="hero-headline text-foreground w-full"
                >
                  {HERO_TEXTS[textIdx][lang]}
                </motion.h1>
              </AnimatePresence>
            </div>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.7 }}
              className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              {tr("hero.subtitle", lang)}
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <button
                onClick={() => scrollTo("appointments")}
                className="px-8 py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:-translate-y-0.5"
              >
                {tr("btn.book", lang)}
              </button>
              <button
                onClick={() => scrollTo("about")}
                className="px-8 py-3.5 border-2 border-primary/30 text-primary rounded-xl font-bold hover:bg-primary/5 transition-all"
              >
                {tr("btn.meet", lang)}
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }}
              className="flex flex-wrap gap-8 justify-center lg:justify-start pt-1"
            >
              {[
                { num: "30+", key: "stat.experience" },
                { num: "10+", key: "stat.awards" },
                { num: "147+", key: "stat.lectures" },
                { num: "30+", key: "stat.publications" },
              ].map((s) => (
                <div key={s.key} className="text-center">
                  <div className="text-2xl font-bold font-serif text-primary">{s.num}</div>
                  <div className="text-sm text-muted-foreground font-medium">{tr(s.key as any, lang)}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Doctor photo + herbs image */}
          <div className="flex-shrink-0 w-full max-w-sm lg:max-w-[380px] xl:max-w-[420px] flex flex-col gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Glow blob */}
              <div className="absolute -inset-6 bg-gradient-to-tr from-primary/10 to-green-200/20 rounded-[3rem] blur-3xl -z-10 pointer-events-none" />

              {/* Photo */}
              <div className="rounded-[2rem] overflow-hidden border-8 border-white shadow-2xl shadow-primary/10">
                <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto object-cover" />
              </div>

              {/* Name + credential card */}
              <div className="mt-4 bg-white border border-border rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between gap-3">
                <div>
                  <p className="font-serif font-bold text-base text-primary leading-tight">
                    {lang === "en" ? "Dr. P. Murali Krishna" : "డా. పి. మురళీకృష్ణ"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">B.A.M.S. (Gold Medalist) · M.D.(Ay) · Ph.D.(Ay)</p>
                </div>
                <div className="flex-shrink-0 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <Award size={14} className="text-yellow-600" />
                  <span className="text-xs font-bold text-yellow-700">{lang === "en" ? "Gold Medalist" : "గోల్డ్ మెడలిస్ట్"}</span>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </SC>

      {/* Feature cards */}
      <SC>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: <ShieldCheck size={26} />, delay: 0, key: "expert", featured: false },
            { icon: <Leaf size={26} />, delay: 0.1, key: "authentic", featured: true },
            { icon: <Clock size={26} />, delay: 0.2, key: "booking", featured: false },
          ].map((f, i) => {
            const content = [
              { title: { en: "Expert Doctor", te: "నిపుణుడైన డాక్టర్" }, desc: { en: "Retired Principal with 3+ decades of experience in Ayurveda.", te: "3 దశాబ్దాలకు పైగా అనుభవం గల విశ్రాంత ప్రిన్సిపాల్." } },
              { title: { en: "Authentic Ayurveda", te: "ప్రామాణిక ఆయుర్వేదం" }, desc: { en: "Traditional Panchakarma and genuine herbal treatments.", te: "సాంప్రదాయ పంచకర్మ మరియు ప్రామాణిక మూలికా చికిత్సలు." } },
              { title: { en: "Easy Booking", te: "సులభమైన బుకింగ్" }, desc: { en: "Check availability and book your appointment online.", te: "లభ్యతను తనిఖీ చేసి ఆన్‌లైన్‌లో అపాయింట్‌మెంట్ బుక్ చేయండి." } },
            ][i];
            return (
              <Reveal key={i} delay={f.delay}>
                <div className={`p-7 rounded-3xl flex flex-col items-center text-center gap-4 border transition-shadow hover:shadow-md h-full ${
                  f.featured ? "bg-primary text-white border-primary shadow-lg shadow-primary/25" : "bg-white border-border/60 shadow-sm"
                }`}>
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${f.featured ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
                    {f.icon}
                  </div>
                  <h3 className={`text-base font-serif font-bold ${f.featured ? "text-white" : ""}`}>{content.title[lang]}</h3>
                  <p className={`text-sm leading-relaxed ${f.featured ? "text-white/80" : "text-muted-foreground"}`}>{content.desc[lang]}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </SC>
    </TexturedSection>
  );
}

// ─── ABOUT ────────────────────────────────────────────────────
function AboutSection({ lang }: { lang: "en" | "te" }) {
  return (
    <TexturedSection id="about" className="py-24 bg-white">
      <SC>
        <SectionHeader label={tr("about.label", lang)} title={tr("about.title", lang)} subtitle={tr("about.subtitle", lang)} />
        <div className="flex flex-col lg:flex-row gap-12 mt-14">

          {/* Photo + credential card */}
          <Reveal direction="left" className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="sticky top-28">
              <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-white ring-1 ring-border">
                <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto" />
              </div>
              <div className="mt-5 bg-[#f7f7f7] border border-primary/20 p-6 rounded-2xl">
                <h3 className="font-serif font-bold text-lg mb-3 text-primary">
                  {lang === "en" ? "Dr. P. Murali Krishna" : "డా. పి. మురళీకృష్ణ"}
                </h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground font-medium">
                  <li>✦ B.A.M.S. (Gold Medalist)</li>
                  <li>✦ M.D. (Ay)</li>
                  <li>✦ Ph.D. (Ay)</li>
                  <li>✦ F.R.A.V.</li>
                  <li>✦ Diploma in Yoga</li>
                </ul>
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-1">{tr("about.position", lang)}</p>
                  <p className="text-sm font-semibold text-foreground">{tr("about.specialist", lang)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Susruta Hospital, Tirupati</p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Bio */}
          <div className="flex-1 space-y-8">
            <Reveal>
              <p className="text-lg leading-relaxed text-foreground/80">{tr("about.intro", lang)}</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h3 className="font-serif text-2xl text-foreground font-bold">{tr("about.academic", lang)}</h3>
              <p className="mt-3 text-foreground/70 leading-relaxed">
                {lang === "en"
                  ? "His academic journey has been marked by excellence from the start. He completed his B.A.M.S. as a Gold Medalist — receiving two gold medals from the Governor of Andhra Pradesh at Nagarjuna University Convocation in 1988. He then acquired M.D.(Ay), Ph.D.(Ay), F.R.A.V., and a Diploma in Yoga."
                  : "అతని విద్యా ప్రయాణం మొదటి నుండే శ్రేష్ఠతతో గుర్తించబడింది. 1988 నాగార్జున విశ్వవిద్యాలయం కన్వొకేషన్‌లో ఆంధ్రప్రదేశ్ గవర్నర్ నుండి రెండు బంగారు పతకాలు స్వీకరించాడు. తరువాత M.D.(Ay), Ph.D.(Ay), F.R.A.V., మరియు యోగ డిప్లొమా పూర్తిచేశారు."}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <h3 className="font-serif text-2xl text-foreground font-bold">{tr("about.experience", lang)}</h3>
              <ul className="mt-3 space-y-2.5 text-foreground/70">
                {[
                  { en: "Principal (Retd.) — S.V. Ayurvedic College & Hospital, T.T. Devasthanams, Tirupati, AP", te: "ప్రిన్సిపాల్ (విశ్రాంత) — ఎస్.వి. ఆయుర్వేద కళాశాల, టి.టి. దేవస్థానాలు, తిరుపతి" },
                  { en: "Consultant Ayurvedic Specialist — Susruta Hospital, Tirupati", te: "సలహా ఆయుర్వేద నిపుణుడు — సుశ్రుత హాస్పిటల్, తిరుపతి" },
                  { en: "SBI Authorised Ayurvedic Doctor", te: "ఎస్.బి.ఐ అధికృత ఆయుర్వేద డాక్టర్" },
                  { en: "Governing Body Member — CCRAS, New Delhi (2015–2018)", te: "పాలక మండలి సభ్యుడు — సిసిఆర్ఎఎస్, న్యూ ఢిల్లీ (2015–2018)" },
                  { en: "Key Note Speaker — First Australasian Conference on Panchakarma & Yoga, Adelaide (2013)", te: "ముఖ్య వక్త — మొదటి ఆస్ట్రేలియన్ పంచకర్మ & యోగ సమావేశం, అడిలైడ్ (2013)" },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-1.5 text-xs">✦</span>
                    <span>{item[lang]}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { num: "30+", en: "Publications", te: "ప్రచురణలు" },
                { num: "147+", en: "Guest Lectures", te: "అతిథి ఉపన్యాసాలు" },
                { num: "25+", en: "Sessions Chaired", te: "అధ్యక్షత వహించిన సెషన్‌లు" },
                { num: "10+", en: "Major Awards", te: "ప్రధాన అవార్డులు" },
              ].map((s, i) => (
                <Reveal key={i} delay={i * 0.08}>
                  <div className="bg-[#f7f7f7] border border-primary/20 p-5 rounded-2xl text-center">
                    <div className="text-3xl font-bold font-serif text-primary mb-1">{s.num}</div>
                    <div className="text-sm font-semibold text-muted-foreground">{s[lang]}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </SC>
    </TexturedSection>
  );
}

// ─── ACHIEVEMENTS ─────────────────────────────────────────────
function AchievementsSection({ lang }: { lang: "en" | "te" }) {
  const awards = [
    { year: "1985", en: { title: "AP State Medal", inst: "Vijayawada" }, te: { title: "ఏపీ రాష్ట్ర పతకం", inst: "విజయవాడ" } },
    { year: "1986", en: { title: "Chavali Ramaiah Memorial Gold Medal", inst: "Nagarjuna University" }, te: { title: "చావలి రమయ్య స్మారక బంగారు పతకం", inst: "నాగార్జున విశ్వవిద్యాలయం" } },
    { year: "1986", en: { title: "Achanta Lakshmipathi Memorial Gold Medal", inst: "Nagarjuna University" }, te: { title: "అచంట లక్ష్మీపతి స్మారక బంగారు పతకం", inst: "నాగార్జున విశ్వవిద్యాలయం" } },
    { year: "1992", en: { title: "Baidyanath Foundation National Award", inst: "Nagpur" }, te: { title: "బైద్యనాథ్ ఫౌండేషన్ జాతీయ అవార్డు", inst: "నాగ్‌పూర్" } },
    { year: "1997", en: { title: "Doctor of Science Honour", inst: "Open International University, Colombo" }, te: { title: "డాక్టర్ ఆఫ్ సైన్స్ గౌరవం", inst: "ఓపెన్ ఇంటర్నేషనల్ యూనివర్సిటీ, కొలంబో" } },
    { year: "2006", en: { title: "Outstanding Young Person — JCI", inst: "JCI South East Zone" }, te: { title: "అత్యుత్తమ యువ వ్యక్తి — జెసిఐ", inst: "జెసిఐ సౌత్ ఈస్ట్ జోన్" } },
    { year: "2006", en: { title: "Outstanding Young Indian — JCI National", inst: "Junior Chamber International India, Bangalore" }, te: { title: "అత్యుత్తమ యువ భారతీయుడు — జెసిఐ జాతీయ", inst: "జూనియర్ ఛాంబర్ ఇంటర్నేషనల్ ఇండియా, బెంగళూరు" } },
    { year: "2016", en: { title: "Dhanvantari Award", inst: "Vijayawada" }, te: { title: "ధన్వంతరి అవార్డు", inst: "విజయవాడ" } },
    { year: "2017", en: { title: "International Charaka Award", inst: "AAPNA, USA · Belagavi" }, te: { title: "అంతర్జాతీయ చరక అవార్డు", inst: "ఎఎపిఎన్ఎ, యుఎస్ఎ · బెళగావి" } },
    { year: "2023", en: { title: "Ayurveda Sarvabhouma Award", inst: "National Sanskrit University, Tirupati" }, te: { title: "ఆయుర్వేద సార్వభౌమ అవార్డు", inst: "జాతీయ సంస్కృత విశ్వవిద్యాలయం, తిరుపతి" } },
  ];

  const featured = awards[awards.length - 1];
  const rest = awards.slice(0, awards.length - 1);

  return (
    <TexturedSection id="achievements" className="py-24 bg-[#162814]">
      <SC>
        {/* Header — white on dark */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-amber-300 font-semibold text-xs uppercase tracking-wider mb-4">
              <Trophy size={13} /> {tr("ach.label", lang)}
            </div>
            <h2 className="text-3xl md:text-4xl xl:text-5xl font-serif font-bold text-white mb-4">{tr("ach.title", lang)}</h2>
            <p className="text-white/60 text-lg leading-relaxed">{tr("ach.subtitle", lang)}</p>
          </Reveal>
        </div>

        {/* Featured award — centrepiece */}
        <Reveal>
          <div className="relative rounded-3xl overflow-hidden mb-8 border border-amber-400/20 bg-white/5 backdrop-blur-sm p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center gap-8">
            {/* Huge year watermark */}
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[8rem] md:text-[11rem] font-bold font-serif text-white/5 select-none leading-none pointer-events-none">
              {featured.year}
            </span>
            {/* Gold medal icon */}
            <div className="flex-shrink-0 w-20 h-20 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
              <Trophy size={36} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-400 font-semibold text-sm uppercase tracking-widest mb-2">{featured.year} · Most Recent Honour</p>
              <h3 className="text-2xl md:text-3xl font-serif font-bold text-white leading-tight mb-2">{featured[lang].title}</h3>
              <p className="text-white/55 text-base">{featured[lang].inst}</p>
            </div>
          </div>
        </Reveal>

        {/* Award grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {rest.map((award, i) => (
            <Reveal key={i} delay={Math.min(i * 0.05, 0.35)}>
              <div className="relative group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/30 transition-all duration-300 p-6 overflow-hidden">
                {/* Subtle year watermark per card */}
                <span className="absolute -right-2 -bottom-4 text-[4.5rem] font-bold font-serif text-white/5 select-none leading-none pointer-events-none">
                  {award.year}
                </span>
                {/* Serial number */}
                <span className="text-xs font-bold text-amber-400/60 uppercase tracking-widest mb-3 block">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h4 className="font-serif font-bold text-lg text-white leading-snug mb-2 pr-6">{award[lang].title}</h4>
                <p className="text-white/45 text-sm">{award[lang].inst}</p>
                {/* Year pill */}
                <span className="mt-4 inline-block px-2.5 py-1 rounded-full border border-amber-400/25 text-amber-400 text-xs font-semibold">
                  {award.year}
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: "5",    en: "CME Programs Organized",      te: "CME కార్యక్రమాలు" },
            { num: "25+",  en: "Scientific Sessions Chaired", te: "అధ్యక్షత వహించిన సెషన్‌లు" },
            { num: "6",    en: "Countries Visited",           te: "సందర్శించిన దేశాలు" },
            { num: "200+", en: "Health Lectures (SVETA)",     te: "ఆరోగ్య ఉపన్యాసాలు" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div className="border border-white/10 bg-white/5 p-5 rounded-2xl text-center">
                <div className="text-3xl font-bold font-serif text-amber-400 mb-1">{s.num}</div>
                <div className="text-sm font-medium text-white/50">{s[lang]}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </SC>
    </TexturedSection>
  );
}

// ─── SERVICES ─────────────────────────────────────────────────
function ServicesSection({ lang }: { lang: "en" | "te" }) {
  const services = [
    { icon: <Activity size={28} />, en: { title: "Ayurvedic Consultations", desc: "Detailed personal consultation using Nadi Pariksha (Pulse diagnosis) and Prakriti analysis to determine the root cause of ailments." }, te: { title: "ఆయుర్వేద సంప్రదింపులు", desc: "వ్యాధి మూల కారణాన్ని నిర్ణయించడానికి నాడీ పరీక్ష మరియు ప్రకృతి విశ్లేషణను ఉపయోగించి వివరణాత్మక సంప్రదింపు." } },
    { icon: <Droplets size={28} />, en: { title: "Panchakarma Therapy", desc: "Authentic detoxification and rejuvenation therapies including Vamana, Virechana, Basti, Nasya, and Raktamokshana." }, te: { title: "పంచకర్మ చికిత్స", desc: "వమన, విరేచన, బస్తి, నస్య మరియు రక్తమోక్షణతో సహా ప్రామాణికమైన డిటాక్సిఫికేషన్ మరియు పునరుజ్జీవన చికిత్సలు." } },
    { icon: <Heart size={28} />, en: { title: "Chronic Disease Management", desc: "Specialized Ayurvedic protocols for Arthritis, Diabetes, Skin disorders, Respiratory conditions, and Gastrointestinal problems." }, te: { title: "దీర్ఘకాలిక వ్యాధి నిర్వహణ", desc: "ఆర్థ్రైటిస్, మధుమేహం, చర్మ వ్యాధులు, శ్వాసకోశ మరియు జీర్ణ సమస్యల నిర్వహణ కోసం ప్రత్యేక ఆయుర్వేద ప్రోటోకాల్‌లు." } },
    { icon: <Leaf size={28} />, en: { title: "Wellness & Rejuvenation", desc: "Rasayana therapies to boost immunity, reduce stress, improve vitality, and promote healthy aging with herbal formulations." }, te: { title: "ఆరోగ్యం & పునరుజ్జీవనం", desc: "రోగనిరోధక శక్తి పెంచడానికి, ఒత్తిడి తగ్గించడానికి, శక్తి మెరుగుపరచడానికి రసాయన చికిత్సలు." } },
  ];

  return (
    <TexturedSection id="services" className="py-24 bg-white">
      <SC>
        <SectionHeader label={tr("svc.label", lang)} title={tr("svc.title", lang)} subtitle={tr("svc.subtitle", lang)} />
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-7">
          {services.map((s, i) => (
            <Reveal key={i} delay={i * 0.1} direction={i % 2 === 0 ? "left" : "right"}>
              <div className="group flex gap-6 p-8 bg-[#f7f7f7] border border-border/60 rounded-3xl hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="h-14 w-14 flex-shrink-0 bg-primary/10 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  {s.icon}
                </div>
                <div>
                  <h3 className="text-xl font-serif font-bold mb-3 text-foreground">{s[lang].title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{s[lang].desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </SC>
    </TexturedSection>
  );
}

// ─── APPOINTMENTS ─────────────────────────────────────────────
function AppointmentsSection({ lang }: { lang: "en" | "te" }) {
  const { data: settings } = useGetSettings();
  const { data: openMonths = [], isLoading: loadingMonths } = useListOpenMonths();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });

  const { data: availability } = useGetAvailability({ month: selectedMonth }, { query: { enabled: !!selectedMonth } });
  const { data: slots = [], isLoading: loadingSlots } = useGetSlots({ date: selectedDate }, { query: { enabled: !!selectedDate } });
  const createMutation = useCreateAppointment();

  const calendarMonth = useMemo(() => selectedMonth ? parseISO(`${selectedMonth}-01`) : null, [selectedMonth]);
  const availableDatesSet = useMemo(() => new Set(availability?.availableDates || []), [availability]);
  const blockedDatesSet = useMemo(() => new Set(availability?.blockedDates || []), [availability]);

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return [];
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = getDay(startOfMonth(calendarMonth));
    const total = getDaysInMonth(calendarMonth);
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= total; d++) {
      days.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [calendarMonth]);

  const today = new Date().toISOString().split("T")[0];
  const MORNING_TIMES = new Set(["10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","01:00 PM"]);
  const morningSlots = slots.filter(s => MORNING_TIMES.has(s.time));
  const eveningSlots = slots.filter(s => !MORNING_TIMES.has(s.time));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !formData.patientName || !formData.patientPhone) return;
    createMutation.mutate(
      { data: { ...formData, date: selectedDate, timeSlot: selectedSlot } },
      { onSuccess: () => setIsSuccess(true) }
    );
  };

  if (settings && !settings.appointmentBookingEnabled) {
    return (
      <TexturedSection id="appointments" className="py-24 bg-[#f7f7f7]">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <Reveal>
            <Calendar size={48} className="mx-auto text-muted-foreground mb-4 opacity-30" />
            <h2 className="text-2xl font-serif font-bold mb-2">{tr("appt.label", lang)}</h2>
            <p className="text-muted-foreground">{tr("appt.unavailable", lang)}</p>
          </Reveal>
        </div>
      </TexturedSection>
    );
  }

  return (
    <TexturedSection id="appointments" className="py-24 bg-[#f7f7f7]">
      <SC>
        <SectionHeader label={tr("appt.label", lang)} title={tr("appt.title", lang)} subtitle={tr("appt.subtitle", lang)} />
        <div className="mt-14 max-w-4xl mx-auto">
          {isSuccess ? (
            <Reveal>
              <div className="max-w-lg mx-auto bg-white p-10 rounded-3xl shadow-md border border-primary/20 text-center">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 size={44} />
                </motion.div>
                <h3 className="text-2xl font-serif font-bold mb-3">{tr("appt.success", lang)}</h3>
                <p className="text-muted-foreground mb-8">{tr("appt.success_msg", lang)}</p>
                <Button onClick={() => {
                  setIsSuccess(false); setSelectedDate(""); setSelectedSlot("");
                  setSelectedMonth(""); setFormData({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });
                }}>
                  {tr("btn.book_another", lang)}
                </Button>
              </div>
            </Reveal>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Reveal>
                <div className="bg-white rounded-3xl shadow-sm border border-border/60 overflow-hidden">
                  <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">1</span>
                    <h3 className="font-serif font-bold text-lg">{tr("appt.step1", lang)}</h3>
                  </div>
                  <div className="p-5 md:p-7">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Month list */}
                      <div className="lg:w-52 flex-shrink-0">
                        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">{tr("form.month", lang)}</p>
                        {loadingMonths ? (
                          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-11 bg-muted animate-pulse rounded-xl" />)}</div>
                        ) : openMonths.filter(m => m.isOpen).length === 0 ? (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex gap-2">
                            <Info size={15} className="shrink-0 mt-0.5" />{tr("appt.no_months", lang)}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {openMonths.filter(m => m.isOpen).map((m) => (
                              <button key={m.id} type="button"
                                onClick={() => { setSelectedMonth(m.month); setSelectedDate(""); setSelectedSlot(""); }}
                                className={`w-full px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all border flex items-center gap-2 ${
                                  selectedMonth === m.month
                                    ? "bg-primary text-white border-primary shadow-sm"
                                    : "border-border hover:border-primary/40 hover:text-primary"
                                }`}
                              >
                                <Calendar size={13} className="shrink-0" />
                                {format(parseISO(`${m.month}-01`), "MMMM yyyy")}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedMonth && (
                          <div className="mt-5 space-y-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-primary/20 ring-1 ring-primary/40 flex-shrink-0" />{tr("appt.legend_avail", lang)}</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-muted border border-border flex-shrink-0" />{tr("appt.legend_unavail", lang)}</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 flex-shrink-0" />{tr("appt.legend_blocked", lang)}</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-primary flex-shrink-0" />{tr("appt.legend_selected", lang)}</div>
                          </div>
                        )}
                      </div>

                      {/* Calendar */}
                      {selectedMonth && calendarMonth ? (
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-serif font-bold text-lg text-primary">{format(calendarMonth, "MMMM yyyy")}</h4>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                              <Info size={11} />{tr("appt.sunday_note", lang)}
                            </span>
                          </div>
                          <div className="grid grid-cols-7 gap-1 mb-1">
                            {(lang === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["ఆది","సోమ","మంగ","బుధ","గురు","శుక్ర","శని"]).map(d => (
                              <div key={d} className="text-center text-[11px] font-bold text-muted-foreground py-1">{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1.5">
                            {calendarDays.map((day, idx) => {
                              if (!day) return <div key={idx} />;
                              const isAvail = availableDatesSet.has(day);
                              const isBlocked = blockedDatesSet.has(day);
                              const isPast = day < today;
                              const isSel = selectedDate === day;
                              let cls = "aspect-square flex items-center justify-center rounded-xl text-sm font-semibold transition-all ";
                              if (isSel) cls += "bg-primary text-white shadow-md ring-2 ring-primary ring-offset-1";
                              else if (isBlocked) cls += "bg-red-50 text-red-300 cursor-not-allowed text-xs";
                              else if (isPast) cls += "text-muted-foreground/30 cursor-not-allowed";
                              else if (isAvail) cls += "bg-primary/15 text-primary hover:bg-primary hover:text-white cursor-pointer hover:shadow-sm";
                              else cls += "text-muted-foreground/40 cursor-not-allowed";
                              return (
                                <button key={day} type="button" disabled={!isAvail || isPast}
                                  onClick={() => { setSelectedDate(day); setSelectedSlot(""); }}
                                  className={cls}
                                >
                                  {day.split("-")[2]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        !loadingMonths && openMonths.length > 0 && (
                          <div className="flex-1 flex items-center justify-center text-muted-foreground/40 border-2 border-dashed border-border rounded-2xl min-h-[200px]">
                            <div className="text-center">
                              <Calendar size={36} className="mx-auto mb-2 opacity-40" />
                              <p className="text-sm">{lang === "en" ? "Select a month to see the calendar" : "క్యాలెండర్ చూడటానికి నెల ఎంచుకోండి"}</p>
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    {/* Time Slots */}
                    <AnimatePresence>
                      {selectedDate && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.35 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-6 pt-6 border-t border-border/60">
                            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                              <Clock size={15} className="text-primary" />
                              {tr("appt.slots_for", lang)} &nbsp;<span className="text-primary">{format(parseISO(selectedDate), lang === "en" ? "EEEE, MMMM d" : "EEEE, d MMMM")}</span>
                              {new Date(selectedDate).getDay() === 0 && (
                                <span className="ml-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">{tr("appt.sunday_note", lang)}</span>
                              )}
                            </p>
                            {loadingSlots ? (
                              <div className="flex gap-2 flex-wrap">{[...Array(7)].map((_, i) => <div key={i} className="h-10 w-24 bg-muted animate-pulse rounded-lg" />)}</div>
                            ) : (
                              <div className="space-y-5">
                                <SlotGroup label={`🌅 ${tr("appt.morning", lang)}`} slots={morningSlots} selected={selectedSlot} onSelect={setSelectedSlot} />
                                {eveningSlots.length > 0 && <SlotGroup label={`🌙 ${tr("appt.evening", lang)}`} slots={eveningSlots} selected={selectedSlot} onSelect={setSelectedSlot} />}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </Reveal>

              {/* Step 2 */}
              <AnimatePresence>
                {selectedSlot && (
                  <motion.div
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
                    transition={{ duration: 0.4 }}
                    className="bg-white rounded-3xl shadow-sm border border-border/60 overflow-hidden"
                  >
                    <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">2</span>
                      <h3 className="font-serif font-bold text-lg">{tr("appt.step2", lang)}</h3>
                      <span className="ml-auto text-sm text-primary font-semibold">
                        {format(parseISO(selectedDate), "MMM d")} · {selectedSlot}
                      </span>
                    </div>
                    <div className="p-5 md:p-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-semibold mb-2">{tr("form.name", lang)} <span className="text-destructive">*</span></label>
                        <input required type="text" value={formData.patientName}
                          onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                          placeholder={lang === "en" ? "Full name" : "పూర్తి పేరు"}
                          className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-2">{tr("form.phone", lang)} <span className="text-destructive">*</span></label>
                        <input required type="tel" value={formData.patientPhone}
                          onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                          placeholder={lang === "en" ? "Mobile number" : "మొబైల్ నంబర్"}
                          className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold mb-2">{tr("form.email", lang)}</label>
                        <input type="email" value={formData.patientEmail}
                          onChange={e => setFormData({ ...formData, patientEmail: e.target.value })}
                          placeholder="example@email.com"
                          className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold mb-2">{tr("form.reason", lang)}</label>
                        <textarea rows={3} value={formData.reason}
                          onChange={e => setFormData({ ...formData, reason: e.target.value })}
                          placeholder={lang === "en" ? "Brief description of your health concern" : "మీ ఆరోగ్య సమస్య సంక్షిప్త వివరణ"}
                          className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none resize-none" />
                      </div>
                      <div className="sm:col-span-2 pt-1">
                        <Button type="submit" size="lg" className="w-full text-base" disabled={createMutation.isPending}>
                          {createMutation.isPending ? tr("loading", lang) : tr("btn.confirm", lang)}
                        </Button>
                        {createMutation.isError && (
                          <p className="text-destructive text-sm text-center mt-3 font-medium">{tr("appt.error", lang)}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          )}
        </div>
      </SC>
    </TexturedSection>
  );
}

function SlotGroup({ label, slots, selected, onSelect }: {
  label: string; slots: { time: string; available: boolean }[]; selected: string; onSelect: (t: string) => void
}) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {slots.map(slot => (
          <button key={slot.time} type="button" disabled={!slot.available} onClick={() => onSelect(slot.time)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
              selected === slot.time
                ? "bg-primary text-white border-primary shadow-sm"
                : slot.available
                ? "bg-white border-border hover:border-primary hover:text-primary"
                : "bg-muted/40 text-muted-foreground/40 border-border/30 cursor-not-allowed line-through"
            }`}
          >
            {slot.time}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── TESTIMONIALS ─────────────────────────────────────────────
function TestimonialsSection({ lang }: { lang: "en" | "te" }) {
  const { data: settings } = useGetSettings();
  const { data: testimonials = [], isLoading } = useListTestimonials();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);

  const total = testimonials.length;

  const go = useCallback((next: number, direction: 1 | -1 = 1) => {
    setDir(direction);
    setCurrent((next + total) % total);
  }, [total]);

  useEffect(() => {
    if (paused || total === 0) return;
    const t = setInterval(() => go(current + 1, 1), 5000);
    return () => clearInterval(t);
  }, [current, paused, total, go]);

  if (settings && !settings.testimonialsEnabled) return null;

  return (
    <TexturedSection id="testimonials" className="py-24 bg-white">
      <SC narrow>
        <SectionHeader label={tr("test.label", lang)} title={tr("test.title", lang)} subtitle={tr("test.subtitle", lang)} />

        {isLoading ? (
          <div className="mt-14 h-72 bg-muted animate-pulse rounded-3xl" />
        ) : total === 0 ? null : (
          <div
            className="mt-14 relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {/* Slide viewport */}
            <div className="overflow-hidden rounded-3xl">
              <AnimatePresence mode="wait" custom={dir}>
                <motion.div
                  key={current}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
                    center: { x: 0, opacity: 1 },
                    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative bg-[#f7f7f7] border border-border/60 p-10 md:p-14 rounded-3xl flex flex-col"
                >
                  {/* Large decorative quote */}
                  <Quote size={56} className="absolute top-8 right-10 text-primary/8 pointer-events-none" />

                  {/* Stars */}
                  <div className="flex gap-1 mb-6 text-yellow-500">
                    {[...Array(5)].map((_, si) => (
                      <Star key={si} size={18} fill={si < testimonials[current].rating ? "currentColor" : "none"} strokeWidth={si < testimonials[current].rating ? 0 : 1.5} />
                    ))}
                  </div>

                  {/* Quote text */}
                  <p className="text-lg md:text-xl text-foreground/85 leading-relaxed italic mb-8 font-serif">
                    "{lang === "te" && testimonials[current].contentTe ? testimonials[current].contentTe : testimonials[current].content}"
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-4 mt-auto">
                    <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm font-serif">
                        {testimonials[current].patientName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold font-serif text-foreground leading-tight">{testimonials[current].patientName}</p>
                      {testimonials[current].patientLocation && (
                        <p className="text-sm text-muted-foreground">{testimonials[current].patientLocation}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Prev / Next buttons */}
            <button
              onClick={() => go(current - 1, -1)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 h-10 w-10 rounded-full bg-white border border-border shadow-md flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => go(current + 1, 1)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 h-10 w-10 rounded-full bg-white border border-border shadow-md flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all z-10"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>

            {/* Dot indicators */}
            <div className="flex justify-center gap-2 mt-8">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => go(i, i > current ? 1 : -1)}
                  className={`transition-all duration-300 rounded-full ${i === current ? "bg-primary w-6 h-2.5" : "bg-border w-2.5 h-2.5 hover:bg-primary/40"}`}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </SC>
    </TexturedSection>
  );
}

// ─── CONTACT ──────────────────────────────────────────────────
function ContactSection({ lang }: { lang: "en" | "te" }) {
  const { data: settings } = useGetSettings();
  return (
    <TexturedSection id="contact" className="py-24 bg-[#f7f7f7]">
      <SC>
        <SectionHeader label={tr("contact.label", lang)} title={tr("contact.title", lang)} subtitle={tr("contact.subtitle", lang)} />
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { icon: <MapPin size={20} />, titleKey: "contact.address", value: settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507" },
              { icon: <Phone size={20} />, titleKey: "contact.phone", value: [settings?.clinicPhone1, settings?.clinicPhone2].filter(Boolean).join(" · ") || "9492068180" },
              { icon: <Clock size={20} />, titleKey: "contact.hours", value: settings?.workingHours || "Mon–Sat: 10:00 AM – 1:00 PM | 6:00 PM – 10:00 PM\nSunday: 10:00 AM – 1:00 PM" },
              { icon: <Mail size={20} />, titleKey: "contact.email", value: settings?.clinicEmail || "—" },
            ].map((item, i) => (
              <Reveal key={item.titleKey} delay={i * 0.08}>
                <div className="bg-white p-6 rounded-2xl border border-border/60 shadow-sm flex flex-col gap-3 h-full">
                  <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-1">{tr(item.titleKey as any, lang)}</p>
                    <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-line">{item.value}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Map embed */}
          <Reveal direction="right">
            <div className="rounded-3xl overflow-hidden border border-border/60 shadow-sm h-full min-h-[340px] bg-[#f3f3f3] flex items-center justify-center">
              <iframe
                title="Susruta Hospital Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3877.7!2d79.4192!3d13.6288!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a4d4b8b3b3b3b3b%3A0x0!2sSusruta+Hospital+Tirupati!5e0!3m2!1sen!2sin!4v1234567890"
                width="100%" height="100%"
                style={{ border: 0, minHeight: "340px" }}
                allowFullScreen loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </Reveal>
        </div>
      </SC>
    </TexturedSection>
  );
}
