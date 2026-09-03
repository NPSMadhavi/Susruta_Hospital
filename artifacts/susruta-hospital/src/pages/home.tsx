import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";
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
  const rafRef = useRef<number | undefined>(undefined);

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
    <>
    <PublicLayout>
      <HeroSection lang={lang} />
      <AboutSection lang={lang} />
      <ServicesSection lang={lang} />
      <WhySusrutaSection />
      <AchievementsSection lang={lang} />
      <TestimonialsSection lang={lang} />
      <ContactSection lang={lang} />
    </PublicLayout>
    </>
  );
}



// ─── HERO ─────────────────────────────────────────────────────
const HERO_TEXTS: Array<{ en: string; te: string }> = [
  {
    en: "Experience Nature's Touch for Your Health",
    te: "మీ ఆరోగ్యం కోసం ప్రకృతి స్పర్శను అనుభవించండి",
  },
  {
    en: "Heal with Ancient Wisdom & Modern Care",
    te: "పురాతన జ్ఞానంతో ఆధునిక సంరక్షణతో స్వస్థత పొందండి",
  },
  {
    en: "30+ Years of Ayurvedic Excellence",
    te: "30+ సంవత్సరాల ఆయుర్వేద శ్రేష్ఠత",
  },
  {
    en: "Trusted Healing in the Heart of Tirupati",
    te: "తిరుపతి హృదయంలో విశ్వసనీయ వైద్యం",
  },
];

function HeroSection({ lang }: { lang: "en" | "te" }) {
  const [activeHeroText, setActiveHeroText] = useState(0);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 88,
        behavior: "smooth",
      });
    }
  };

  // Change hero text automatically
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHeroText((prev) => (prev + 1) % HERO_TEXTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <section
        id="home"
        className="relative pt-24 pb-32 bg-white overflow-hidden"
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-125 lg:scale-108 z-0"
        >
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>

        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(90deg, #F5F2E9 0%, rgba(245, 242, 233, 0.85) 50%, rgba(245, 242, 233, 0.1) 100%)",
          }}
        />

        <SC>
          <div className="relative z-10 max-w-2xl flex flex-col items-start text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-2 md:mb-4 text-[#AB6342] uppercase tracking-[2.53px] text-[11px] md:text-[14px] lg:text-[15px]  leading-[30.92px]"
              style={{  fontWeight: 700 }}
            >
              Authentic Ayurvedic Healing
            </motion.div>

            {/* Animated Hero Text */}
            <div className="relative w-full mb-4 md:mb-6">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={activeHeroText}
                  initial={{ opacity: 0, y: 35 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -35 }}
                  transition={{
                    duration: 0.8,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="text-[#0A2B21] text-[33px] leading-10 md:leading-19 font-semibold md:text-[64px]"
                  style={{
                    fontFamily: "DM Serif Display",
                    letterSpacing: "-0.7px",
                  }}
                >
                  {HERO_TEXTS[activeHeroText][lang]}
                </motion.h1>
              </AnimatePresence>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.7 }}
              className="text-[#222D28BF] text-[16px] md:text-[18px] leading-[24px] md:leading-[29.25px] mb-7 md:mb-10 max-w-xl"
              style={{ fontWeight: 400 }}
            >
              Led by Dr. P. Murali Krishna — Gold Medalist, Ph.D., and former
              Principal of S.V. Ayurvedic College — bringing three decades of
              authentic healing to Tirupati.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.6 }}
              className="flex flex-row sm:flex-row gap-3 md:gap-4"
            >
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-booking-modal")
                  )
                }
                className="px-5 md:px-8 py-3 md:py-3.5 bg-[#D95B2F] text-[#F5F2E9] rounded-[10px] text-[13px] md:text-[16px] leading-[20px] shadow-lg hover:opacity-90 transition-all"
                style={{ fontWeight: 600 }}
              >
                Book Appointment
              </button>

              <button
                onClick={() => scrollTo("about")}
                className="px-5 md:px-8 py-3 md:py-3.5 border border-[#D95B2F] text-[#D95B2F] rounded-[10px] text-[13px] md:text-[16px] leading-[20px] hover:bg-[#D95B2F]/5 transition-all"
                style={{ fontWeight: 600 }}
              >
                Meet the doctor
              </button>
            </motion.div>
          </div>
        </SC>
      </section>


      {/* Stats Section */}
      <section className="p-3 md:py-6 bg-[#FFFFFF99] border-y border-[#DDD9CF] backdrop-blur-sm">
        <SC>
          <div className="flex flex-wrap justify-between items-center gap-7 md:gap-5 lg:gap-12 text-center max-w-6xl mx-auto">
            {[
              { num: "30+", label: "YEARS OF EXPERIENCE" },
              { num: "10+", label: "AWARDS & RECOGNITIONS" },
              { num: "30+", label: "RESEARCH PUBLICATIONS" },
              { num: "147+", label: "LECTURES & SESSIONS" },
            ].map((s, i) => (
              <div key={i} className="flex-1 min-w-[150px] text-[35px] md:text-[40px] lg:text-[48px]">
                <div className="text-[#15392D] mb-2" style={{ fontFamily: 'DM Serif Display', lineHeight: '48px', letterSpacing: '-0.48px' }}>
                  {s.num}
                </div>
                <div className="text-[#4E5C55] text-[11px] md:text-[11px] lg:text-[12px] uppercase" style={{ fontWeight: 600,  lineHeight: '16px', letterSpacing: '1.68px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </SC>
      </section>
    </>
  );
}
// ─── ABOUT ────────────────────────────────────────────────────
function AboutSection({ lang }: { lang: "en" | "te" }) {
  return (
    <section id="about" className="py-20 bg-[#F5F2E9]">
      <SC>

        <div className="flex flex-col lg:flex-row gap-12 max-w-full mx-auto">

          {/* Photo */}
          <div className="w-full lg:w-[400px] flex-shrink-0 relative rounded-3xl mt-12 overflow-hidden min-h-[400px]">
            <img
              src={drPhoto}
              alt="Dr. P. Murali Krishna"
              className="absolute inset-0 w-full  rounded-3xl h-full object-cover"
            />

            <div className="absolute bottom-4 left-6 right-6 bg-[#F5F2E9] rounded-2xl p-3 shadow-sm border border-white/20">
              <h3
                className="text-[#0A2B21] font-bold"
                style={{
                  fontFamily: 'DM Serif Display',
                  fontSize: '18px',
                  lineHeight: '28px'
                }}
              >
                Dr. P. Murali Krishna
              </h3>

              <p
                className="mt-[3px] text-[#AB6342] uppercase"
                style={{
                  fontWeight: 600,
                  fontSize: '12.5px',
                  lineHeight: '16.8px',
                  letterSpacing: '1.34px'
                }}
              >
                B.A.M.S. (Gold Medalist), M.D. (Ay), Ph.D. (Ay), F.R.A.V., D.Yoga
              </p>
            </div>
          </div>

          {/* Bio */}
          <div className="flex-1 flex flex-col">

            {/* Section Heading */}
            <div
              className="text-[#AB6342] uppercase mb-7 text-[13px] md:text-[14px] lg:text-[15px]"
              style={{
                fontWeight: 700,
                lineHeight: '17.28px',
                letterSpacing: '2.53px'
              }}
            >
              About The Doctor
            </div>

            <h2
              className="text-[#0A2B21] font-semibold text-[38px] mb-4"
              style={{
                fontFamily: 'DM Serif Display',
                lineHeight: '40px'
              }}
            >
              Meet the expert behind Susruta
            </h2>

            <p
              className="text-[#1B3227CC] mb-6"
              style={{
                fontSize: '16px',
                lineHeight: '26.3px'
              }}
            >
              Dr. P. Murali Krishna is a highly distinguished Ayurvedic Physician, Academician, and Researcher. He served as Principal of the prestigious S.V. Ayurvedic College, T.T. Devasthanams, Tirupati.
            </p>

            <h3 className="text-[#0A2B21] font-serif text-2xl font-bold mb-4">
              Academic Brilliance
            </h3>

            <p
              className="text-[#1B3227CC] mb-6"
              style={{
                fontSize: '16px',
                lineHeight: '26.3px'
              }}
            >
              His academic journey has been marked by excellence from the start. He completed his B.A.M.S. as a Gold Medalist — receiving two gold medals from the Governor of Andhra Pradesh at Nagarjuna University Convocation in 1988. He then acquired M.D.(Ay), Ph.D.(Ay), F.R.A.V., and a Diploma in Yoga.
            </p>

            <h3 className="text-[#0A2B21] font-serif text-2xl font-bold mb-4">
              Professional Experience
            </h3>

            <ul
              className="space-y-3 text-[#1B3227CC]"
              style={{
                fontSize: '16px',
                lineHeight: '20.3px'
              }}
            >
              {[
                "Principal (Retd.) — S.V. Ayurvedic College & Hospital, T.T. Devasthanams, Tirupati, AP",
                "Consultant Ayurvedic Specialist — Susruta Hospital, Tirupati",
                "SBI Authorised Ayurvedic Doctor",
                "Governing Body Member — CCRAS, New Delhi (2015–2018)",
                "Key Note Speaker — First Australasian Conference on Panchakarma & Yoga, Adelaide (2013)"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#0A2B21] mt-1 text-xs">✦</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

          </div>
        </div>
      </SC>
    </section>
  );
}

// ─── SERVICES ─────────────────────────────────────────────────
function ServicesSection({ lang }: { lang: "en" | "te" }) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const services = [
    { image: "/service1.png", title: "Ayurvedic Consultation", desc: "Detailed personal consultation using Nadi Pariksha (Pulse diagnosis) and Prakriti analysis to determine the root cause of ailments." },
    { image: "/service2.png", title: "Panchakarma Therapy", desc: "Authentic detoxification and rejuvenation therapies including Vamana, Virechana, Basti, Nasya, and Raktamokshana." },
    { image: "/service3.png", title: "Chronic Disease Management", desc: "Specialized Ayurvedic protocols for Arthritis, Diabetes, Skin disorders, Respiratory conditions, and Gastrointestinal problems." },
    { image: "/service4.png", title: "Wellness & Rejuvenation", desc: "Rasayana therapies to boost immunity, reduce stress, improve vitality, and promote healthy aging with herbal formulations." },
  ];

  return (
    <section id="services" className="py-20 bg-[#FFFFFF99]">
      <SC>
        <div className="text-center max-w-3xl mx-auto mb-15">
          <div className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5" style={{ fontWeight: 700,  lineHeight: '17.28px', letterSpacing: '2.53px' }}>
            Our Services
          </div>
          <h2 className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold   mb-3" style={{ fontFamily: 'DM Serif Display',  lineHeight: '48.89px', letterSpacing: '-0.44px' }}>
            Holistic Ayurvedic Care
          </h2>
          <p className="text-[#4E5C55] text-[16px] md:text-[20px] " style={{  lineHeight: '29.25px' }}>
                    Comprehensive treatments tailored to your unique mind-body constitution.          </p>
        </div>
        
        <div className="relative">
          {/* Dummy grid to maintain exact original height on desktop */}
          <div className="hidden lg:grid grid-cols-4 gap-6 invisible pointer-events-none" aria-hidden="true">
            <div className="aspect-[2/3] min-h-[500px]"></div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-6 lg:absolute lg:inset-0">
            {services.map((s, i) => {
              const isHovered = hoveredCard === i;
              const isAnyHovered = hoveredCard !== null;
              
              return (
                <div 
                  key={i} 
                  onMouseEnter={() => setHoveredCard(i)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="relative rounded-2xl overflow-hidden aspect-[2/3] lg:aspect-auto lg:h-full group transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
                  style={{
                    flex: isHovered ? '2.5' : isAnyHovered ? '0.7' : '1',
                  }}
                >
                  <img 
                    src={s.image} 
                    alt={s.title} 
                    className="absolute inset-0 w-full h-full object-cover grayscale-[20%] transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-700" />
                  
                  <div className="absolute bottom-6 left-6 right-6 flex flex-col justify-end">
                    <h3 className="text-[#FFFFFF] text-[20px] md:text-[22px] mb-3 transition-transform duration-700" style={{ fontFamily: 'DM Serif Display',  lineHeight: '27.5px' }}>
                      {s.title}
                    </h3>
                    
                    <div 
                      className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] hidden lg:block ${isHovered ? 'max-h-[200px] opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-4'}`}
                    >
                      <p className="text-white/90 text-[14px] md:text-[16px] leading-relaxed" >
                        {s.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SC>
    </section>
  );
}

// ─── WHY SUSRUTA ─────────────────────────────────────────────
function WhySusrutaSection() {
  const cards = [
    {
      icon: <Award size={20} className="text-[#15392D]" />,
      title: "Expert Doctor",
      desc: "Retired Principal with 3+ decades of experience in Ayurveda.",
    },
    {
      icon: <Leaf size={20} className="text-[#15392D]" />,
      title: "Authentic Ayurveda",
      desc: "Traditional Panchakarma and genuine herbal treatments.",
    },
    {
      icon: <CalendarCheck size={20} className="text-[#15392D]" />,
      title: "Easy Booking",
      desc: "Check availability and book your appointment online.",
    },
  ];

  return (
    <section className="pt-20 pb-1 bg-[#F5F2E9]">
      <SC>
        <div className="text-center max-w-3xl mx-auto mb-15">
          <div
            className="text-[#AB6342] text-[13px] md:text-[14px] uppercase mb-5"
            style={{
              
              fontWeight: 700,
              lineHeight: "17.28px",
              letterSpacing: "2.53px",
            }}
          >
            Why Susruta
          </div>

          <h2
            className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold"
            style={{
              fontFamily: "DM Serif Display",
              lineHeight: "48.89px",
              letterSpacing: "-0.44px",
            }}
          >
            A hospital built on knowledge
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl mx-auto">
          {cards.map((c, i) => (
            <div
              key={i}
              className="
                bg-[#FFFFFF]
                rounded-3xl
                p-7
                flex flex-col
                items-center
                text-center
                shadow-sm
                transition-all
                duration-300
                ease-out
                hover:scale-[1.03]
                hover:shadow-lg
                hover:-translate-y-1
              "
            >
              <div className="h-12 w-12 rounded-full border bg-[#2A6F501A] flex items-center justify-center mb-5">
                {c.icon}
              </div>

              <h3
                className="text-[#0A2B21] text-[18px] md:text-[20px] font-semibold mb-2"
                style={{
                  fontFamily: "DM Serif Display",
                  lineHeight: "28px",
                }}
              >
                {c.title}
              </h3>

              <p
                className="text-[#4E5C55] text-[15px] md:text-[16px]"
                style={{
                  
                  lineHeight: "20.75px",
                }}
              >
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </SC>
    </section>
  );
}

// ─── ACHIEVEMENTS ─────────────────────────────────────────────
function AchievementsSection({ lang }: { lang: "en" | "te" }) {
  const awards = [
    { year: "1985", en: { title: "AP State Medal", inst: "Best scientific paper on 'Ayurvedic Approach to Skin Diseases', Vijayawada" }, te: { title: "ఏపీ రాష్ట్ర పతకం", inst: "విజయవాడలో 'చర్మ వ్యాధులకు ఆయుర్వేద విధానం'పై ఉత్తమ శాస్త్రీయ పత్రం" } },
    { year: "1986", en: { title: "Chavali Ramaiah Memorial Gold Medal", inst: "Nagarjuna University — outstanding performance in final B.A.M.S." }, te: { title: "చావలి రమయ్య స్మారక బంగారు పతకం", inst: "నాగార్జున విశ్వవిద్యాలయం — చివరి B.A.M.S.లో అత్యుత్తమ ప్రదర్శన" } },
    { year: "1986", en: { title: "Achanta Lakshmipathi Memorial Gold Medal", inst: "Nagarjuna University — outstanding performance across all five B.A.M.S. years" }, te: { title: "అచంట లక్ష్మీపతి స్మారక బంగారు పతకం", inst: "నాగార్జున విశ్వవిద్యాలయం — అన్ని ఐదు B.A.M.S. సంవత్సరాలలో శ్రేష్ఠ ప్రదర్శన" } },
    { year: "1992", en: { title: "Baidyanath Foundation National Award", inst: "Best scientific paper on 'Scientific basis of Ayurvedic Diagnostics', Nagpur" }, te: { title: "బైద్యనాథ్ ఫౌండేషన్ జాతీయ అవార్డు", inst: "నాగ్‌పూర్‌లో 'ఆయుర్వేద నిర్ధారణ యొక్క శాస్త్రీయ ఆధారం'పై ఉత్తమ పత్రం" } },
    { year: "1997", en: { title: "Doctor of Science Honour", inst: "Open International University for Complementary Medicine, Colombo" }, te: { title: "డాక్టర్ ఆఫ్ సైన్స్ గౌరవం", inst: "ఓపెన్ ఇంటర్నేషనల్ యూనివర్సిటీ ఫర్ కాంప్లిమెంటరీ మెడిసిన్, కొలంబో" } },
    { year: "2006", en: { title: "Outstanding Young Person — JCI", inst: "JCI South East Zone — Coastal AP and Orissa" }, te: { title: "అత్యుత్తమ యువ వ్యక్తి — జెసిఐ", inst: "జెసిఐ సౌత్ ఈస్ట్ జోన్ — కోస్టల్ ఏపీ మరియు ఒరిస్సా" } },
    { year: "2006", en: { title: "Outstanding Young Indian — JCI National", inst: "Junior Chamber International India — National Award, Bangalore" }, te: { title: "అత్యుత్తమ యువ భారతీయుడు — జెసిఐ జాతీయ", inst: "జూనియర్ ఛాంబర్ ఇంటర్నేషనల్ ఇండియా — జాతీయ అవార్డు, బెంగళూరు" } },
    { year: "2016", en: { title: "Dhanvantari Award", inst: "Outstanding services in Ayurveda, Vijayawada" }, te: { title: "ధన్వంతరి అవార్డు", inst: "విజయవాడలో ఆయుర్వేదంలో అత్యుత్తమ సేవలు" } },
    { year: "2017", en: { title: "International Charaka Award", inst: "AAPNA, USA — excellence in Ayurvedic teaching, Belagavi" }, te: { title: "అంతర్జాతీయ చరక అవార్డు", inst: "ఎఎపిఎన్ఎ, యుఎస్ఎ — ఆయుర్వేద బోధనలో శ్రేష్ఠత" } },
    { year: "2023", en: { title: "Ayurveda Sarvabhouma Award", inst: "National Sanskrit University, Tirupati" }, te: { title: "ఆయుర్వేద సార్వభౌమ అవార్డు", inst: "జాతీయ సంస్కృత విశ్వవిద్యాలయం, తిరుపతి" } },
    { year: "2026", en: { title: "Best Doctor Award", inst: "" }, te: { title: "", inst: "" } },

  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      
      if (scrollRef.current && !paused) {
        scrollRef.current.scrollLeft += (dt * 0.12); // Increased speed
        // Seamless loop: reset when we've scrolled past the first half (duplicated set)
        if (scrollRef.current.scrollLeft >= scrollRef.current.scrollWidth / 2) {
           scrollRef.current.scrollLeft -= scrollRef.current.scrollWidth / 2;
        }
      }
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [paused]);

  const duplicatedAwards = [...awards, ...awards];

  return (
    <section id="achievements" className="pt-24 pb-12 bg-[#F5F2E9] overflow-hidden">
      <div className="text-center max-w-3xl mx-auto mb-8 px-4">
        <div className="text-[#AB6342] text-[13px] md:text-[14px] uppercase mb-5" style={{ fontWeight: 700, lineHeight: '17.28px', letterSpacing: '2.53px' }}>
         Awards & Recognitions
        </div>
        <h2 className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold mb-3" style={{ fontFamily: 'DM Serif Display', lineHeight: '48.89px', letterSpacing: '-0.44px' }}>
        A Legacy of Excellence
        </h2>
        <p className="text-[#4E5C55] text-[16px] md:text-[20px] " style={{ lineHeight: '29.25px' }}>
         Over four decades of distinguished service to Ayurveda, recognised nationally and internationally
        </p>
      </div>

      <div 
        className="relative w-full overflow-x-auto hide-scrollbar cursor-grab active:cursor-grabbing"
        ref={scrollRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex w-max items-center relative py-10 pl-16 pr-16">
          {/* Horizontal line — spans exactly the cards area */}
          <div className="absolute left-16 right-16 top-1/2 -translate-y-1/2 h-[1px] bg-[#D95B2F]" />
          
          <div className="flex gap-16 relative">
            {duplicatedAwards.map((award, i) => {
              const isTop = i % 2 === 0;
              return (
                <div key={i} className="relative w-[350px] shrink-0 h-[450px]">
                  {/* Top content */}
                  <div className="absolute top-0 bottom-1/2 left-0 right-0 w-full flex items-end pb-8">
                    {isTop && (
                      <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40 w-full relative">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h4 className=" font-semibold text-[#0A2B21] text-xl leading-snug"style={{ fontFamily: 'DM Serif Display' }}>{award[lang].title}</h4>
                          <span className="shrink-0 px-3 py-1 bg-[#FDF2EC] text-[#D95B2F] text-xs font-bold rounded-full">{award.year}</span>
                        </div>
                        <p className="text-[#4E5C55] text-[15px] md:text-[16px] leading-relaxed" >{award[lang].inst}</p>
                      </div>
                    )}
                  </div>

                  {/* Trophy icon on the line */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 shrink-0 bg-[#D95B2F] rounded-full flex items-center justify-center z-10 text-white shadow-md">
                    <Trophy size={16} />
                  </div>

                  {/* Bottom content */}
                  <div className="absolute top-1/2 bottom-0 left-0 right-0 w-full flex items-start pt-8">
                    {!isTop && (
                      <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40 w-full relative">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h4 className=" font-semibold text-[#0A2B21] text-xl leading-snug"style={{ fontFamily: 'DM Serif Display' }}>{award[lang].title}</h4>
                          <span className="shrink-0 px-3 py-1 bg-[#FDF2EC] text-[#D95B2F] text-xs font-bold rounded-full">{award.year}</span>
                        </div>
                        <p className="text-[#4E5C55] text-[15px] md:text-[16px] leading-relaxed" >{award[lang].inst}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
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
      <TexturedSection id="appointments" className="py-20 bg-[#f7f7f7]">
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
    <TexturedSection id="appointments" className="py-20 bg-[#f7f7f7]">
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

  // Static fallback testimonials used when DB has no data yet
  const fallbackTestimonials = [
    { id: -1, patientName: "R. K.", patientLocation: "Joint & Arthritis Care", content: "After years of knee discomfort, the treatment plan and therapies at Susruta helped me move with much greater ease. The doctor explained everything patiently.", rating: 5 },
    { id: -2, patientName: "L. D.", patientLocation: "Digestive Health", content: "I had struggled with acidity and poor digestion for a long time. The personalised diet guidance and medicines made a real difference within a few months.", rating: 5 },
    { id: -3, patientName: "S. P.", patientLocation: "Skin Health", content: "What I appreciated most was the honesty — no tall claims, just a clear plan and steady improvement with regular follow-ups.", rating: 5 },
    { id: -4, patientName: "M. R.", patientLocation: "Wellness & Rejuvenation", content: "The Rasayana programme after my illness helped me regain my strength and sleep. The hospital is calm, clean and professionally run.", rating: 5 },
    { id: -5, patientName: "A. V.", patientLocation: "Chronic Disease Care", content: "Dr. Murali Krishna took the time to understand my condition thoroughly before prescribing. I've seen real improvement in my diabetes management.", rating: 5 },
    { id: -6, patientName: "P. S.", patientLocation: "Panchakarma Therapy", content: "The Panchakarma treatment was rejuvenating. The staff was attentive and the procedures were done with great care and expertise.", rating: 5 },
    { id: -7, patientName: "N. K.", patientLocation: "Back Pain Relief", content: "After struggling with chronic back pain for years, two weeks of treatment at Susruta gave me relief I hadn't experienced in a long time.", rating: 5 },
    { id: -8, patientName: "T. R.", patientLocation: "Respiratory Health", content: "My asthma episodes reduced significantly after following the treatment plan. I feel more confident and energetic now.", rating: 5 },
  ] as Array<{ id: number; patientName: string; patientLocation: string; content: string; rating: number; contentTe?: string }>;

  const displayTestimonials = testimonials.length > 0 ? testimonials : fallbackTestimonials;

  // Split into 4 columns
  const numColumns = 4;
  const cols: (typeof displayTestimonials[number])[][] = Array.from({ length: numColumns }, () => []);
  
  if (displayTestimonials.length > 0) {
    // Distribute testimonials round-robin across all 4 columns.
    // Ensure we have at least 4 items per column (16 total) for the seamless loop animation.
    const totalNeeded = Math.max(displayTestimonials.length, 16);
    for (let i = 0; i < totalNeeded; i++) {
      cols[i % numColumns].push(displayTestimonials[i % displayTestimonials.length]);
    }
  }

  const getAnimationProps = (colIndex: number) => {
    const isUp = colIndex % 2 === 0;
    const durations = [42, 48, 44, 50];
    const duration = durations[colIndex % durations.length];
    return {
      animation: `marquee-${isUp ? 'up' : 'down'} ${duration}s linear infinite`,
    };
  };

  return (
    <section id="testimonials" className="py-20 bg-[#FFFFFF99];">
      <SC>
        <div className="mb-18">
          <div className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5" style={{ fontWeight: 700, lineHeight: '17.28px', letterSpacing: '2.53px' }}>
            Patient Stories
          </div>
          <h2 className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold mb-3" style={{ fontFamily: 'DM Serif Display',  lineHeight: '48.89px', letterSpacing: '-0.44px' }}>
            Stories from our patients
          </h2>
          <p className="text-[#4E5C55] text-[18px] md:text-[20px]" style={{  lineHeight: '29.25px' }}>
            Honest experiences from people who have received care at Susruta.
          </p>
        </div>

        {isLoading ? (
          <div className="h-[600px] bg-muted/20 animate-pulse rounded-3xl" />
        ) : (
          <div 
            className="relative h-[680px] overflow-hidden rounded-3xl group"
            style={{ 
              maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full motion-reduce:hidden">
              {cols.map((col, colIdx) => (
                <div key={colIdx} className={`flex flex-col gap-6 relative ${colIdx > 1 ? 'hidden lg:flex' : ''} ${colIdx === 1 ? 'hidden md:flex' : ''}`}>
                  <div 
                    className="flex flex-col gap-6 w-full hover:[animation-play-state:paused]"
                    style={{ ...getAnimationProps(colIdx) }}
                  >
                    {/* Double the column content for seamless infinite loop */}
                    {[...col, ...col].map((t, i) => (
                      
 <div
  key={`${colIdx}-${i}`}
  className="bg-[#F5F2E9] border border-[#DDD9CF] p-8 rounded-3xl shrink-0 flex flex-col justify-between transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-xl"
  style={{ minHeight: '300px' }}
>                       <div>
                          <Quote size={28} className="text-[#15392D] mb-4 opacity-50" />
                          <div className="flex gap-1 mb-6 text-[#AB6342]">
                            {[...Array(5)].map((_, si) => (
                              <Star key={si} size={16} fill={si < t.rating ? "currentColor" : "none"} strokeWidth={si < t.rating ? 0 : 1.5} />
                            ))}
                          </div>
                          <p className="text-[#4E5C55] text-[14px] md:text-[15px] leading-relaxed" >
                            "{lang === "te" && t.contentTe ? t.contentTe : t.content}"
                          </p>
                        </div>
                        <div className="flex items-center gap-4 pt-6 ">
                          <div className="h-10 w-10 rounded-full bg-[#E2EAE5] flex items-center justify-center flex-shrink-0 text-[#15392D] font-bold text-sm" style={{ fontFamily: 'DM Serif Display' }}>
                            {t.patientName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[#4E5C55] text-[15px] md:text-[16px] leading-tight" style={{ fontFamily: 'DM Serif Display' }}>{t.patientName}</p>
                            {t.patientLocation && (
                              <p className="text-xs text-[#4E5C55] mt-1">{t.patientLocation}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Reduced motion fallback (static grid) */}
            <div className="hidden motion-reduce:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 h-full overflow-y-auto pb-10">
              {testimonials.map((t, i) => (
               <div
  key={i}
  className="bg-[#FFFFFF] p-8 rounded-3xl flex flex-col justify-between transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-xl"
  style={{ minHeight: '300px' }}
>
                  <div>
                    <Quote size={28} className="text-[#A4B1A8] mb-4 opacity-50" />
                    <div className="flex gap-1 mb-6 text-[#AB6342]">
                      {[...Array(5)].map((_, si) => (
                        <Star key={si} size={16} fill={si < t.rating ? "currentColor" : "none"} strokeWidth={si < t.rating ? 0 : 1.5} />
                      ))}
                    </div>
                    <p className="text-[#4E5C55] leading-relaxed" style={{ fontFamily: 'Manrope', fontSize: '14.5px' }}>
                      "{lang === "te" && t.contentTe ? t.contentTe : t.content}"
                    </p>
                  </div>
                  <div className="flex items-center gap-4  pt-6 ">
                    <div className="h-10 w-10 rounded-full bg-[#E2EAE5] flex items-center justify-center flex-shrink-0 text-[#15392D] font-bold text-sm" style={{ fontFamily: 'DM Serif Display' }}>
                      {t.patientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-[#1B3227] leading-tight" style={{ fontFamily: 'DM Serif Display', fontSize: '16px' }}>{t.patientName}</p>
                      {t.patientLocation && (
                        <p className="text-xs text-[#8D9B95] mt-1" style={{ fontFamily: 'Manrope' }}>{t.patientLocation}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SC>
      <style>{`
        @keyframes marquee-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes marquee-down {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

// ─── CONTACT ──────────────────────────────────────────────────
function ContactSection({ lang }: { lang: "en" | "te" }) {
  const { data: settings } = useGetSettings();

  const handleBookClick = () => {
    window.dispatchEvent(new CustomEvent("open-booking-modal"));
  };

  // Current day
  const today = new Date();

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const todayName = dayNames[today.getDay()];

  const todayHours =
    todayName === "Sunday"
      ? "10:00 AM - 1:00 PM"
      : "10:00 AM - 1:00 PM";

  return (
    <section id="contact" className="py-20 bg-[#F5F2E9]">
      <SC>
        <div className="text-center max-w-3xl mx-auto mb-15">
          <div
            className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5"
            style={{
              
              fontWeight: 700,
              lineHeight: "17.28px",
              letterSpacing: "2.53px",
            }}
          >
            Contact Us
          </div>

          <h2
            className="text-[#0A2B21] font-semibold text-[30px] mb-3 md:text-[44px]"
            style={{
              fontFamily: "DM Serif Display",
              lineHeight: "48.89px",
              letterSpacing: "-0.44px",
            }}
          >
            Get in touch
          </h2>
          <p className="text-[#4E5C55] text-[16px] md:text-[20px] " style={{  lineHeight: '29.25px' }}>
                    We are here to help you. Reach us during working hours      </p>
        </div>

        <div className="max-w-7xl mx-auto">
          {/* Top 3 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-6">

            {/* Address */}
            <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40">
              <div className="h-10 w-10 bg-[#EAF0EC] text-[#1B3227] rounded-[15px] flex items-center justify-center mb-6">
                <MapPin size={18} />
              </div>

              <h4
                className="text-[#4E5C55] font-semibold text-[16px] md:text-[18px] tracking-widest uppercase mb-2"
                style={{ fontFamily: "DM Serif Display" }}
              >
                Address
              </h4>

              <p
                className="text-[#1B3227CC] text-[14px] md:text-[16px] leading-relaxed"
                
              >
                {settings?.clinicAddress ||
                  "119, Ramulavari North Mada Street, Tirupati - 517 507"}
              </p>
            </div>

            {/* Phone */}
            <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40">
              <div className="h-10 w-10 bg-[#EAF0EC] text-[#1B3227] rounded-[15px] flex items-center justify-center mb-6">
                <Phone size={18} />
              </div>

              <h4
                className="text-[#4E5C55] font-semibold text-[16px] md:text-[18px] tracking-widest uppercase mb-2"
                style={{ fontFamily: "DM Serif Display" }}
              >
                Phone
              </h4>

              <p
                className="text-[#1B3227CC] text-[14px] md:text-[16px] leading-relaxed"
               
              >
                {[settings?.clinicPhone1, settings?.clinicPhone2]
                  .filter(Boolean)
                  .join(" · ") || "9492068180 · 0877-2220663"}
              </p>

              <p
                className="text-[#8D9B95] text-[14px] md:text-[16px] mt-1"
                
              >
                Please call during office hours only.
              </p>
            </div>

            {/* Email */}
            <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40">
              <div className="h-10 w-10 bg-[#EAF0EC] text-[#1B3227] rounded-[15px] flex items-center justify-center mb-6">
                <Mail size={18} />
              </div>

              <h4
                className="text-[#4E5C55] font-semibold text-[16px] md:text-[18px] tracking-widest uppercase mb-2"
                style={{ fontFamily: "DM Serif Display" }}
              >
                Email
              </h4>

              <p
                className="text-[#1B3227CC] text-[14px] md:text-[16px] leading-relaxed break-words"
               
              >
                {settings?.clinicEmail || "reachus@susrutahospital.com"}
              </p>
            </div>
          </div>

          {/* Bottom 2 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">

            {/* Working Hours */}
            <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-[#EAF0EC] text-[#1B3227] rounded-[15px] flex items-center justify-center">
                  <Clock size={18} />
                </div>

                <h4
                  className="text-[#4E5C55] font-semibold text-[16px] md:text-[18px] tracking-widest uppercase"
                  style={{ fontFamily: "DM Serif Display" }}
                >
                  Working Hours
                </h4>
              </div>

              <div className="flex-1 flex flex-col justify-center">

                {/* Today's Working Hours */}
                <div className="bg-[#FEF6EE] text-[#D95B2F] rounded-xl px-4 py-3 flex justify-between items-center mb-4">
  <div
    className="flex items-center gap-2 font-medium text-[14px] md:text-[16px]"
    style={{ fontFamily: "Dm sans" }}
  >
    <span className="w-2 h-2 rounded-full bg-[#D95B2F]" />
    Today ({todayName})
  </div>

  <div
    className="font-medium text-[13px] md:text-[15px] text-right"
   
  >
    <div>10:00 AM - 1:00 PM</div>
    <div className="mt-2">6:00 PM - 10:00 PM</div>
  </div>
</div>

                {/* Monday - Saturday */}
                <div className="px-4 py-4 border-b border-[#EAE7E0] flex justify-between items-start">
                  <div
                    className="text-[#1B3227] text-[14px] md:text-[16px] font-medium"
                   
                  >
                    Monday - Saturday
                  </div>

                  <div
                    className="text-right text-[13px] md:text-[15px] text-[#15392D]"
                    
                  >
                    <div className="mb-2">10:00 AM - 1:00 PM</div>
                    <div>6:00 PM - 10:00 PM</div>
                  </div>
                </div>

                {/* Sunday */}
                <div className="px-4 py-4 flex justify-between items-center">
                  <div
                    className="text-[#1B3227] text-[14px] md:text-[16px] font-medium"
                    
                  >
                    Sunday
                  </div>

                  <div
                    className="text-[#15392D] text-[13px] md:text-[15px]"
                    style={{  fontSize: "14px" }}
                  >
                    10:00 AM - 1:00 PM
                  </div>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="bg-[#FFFFFF] p-8 rounded-3xl shadow-sm border border-[#DDD9CF]/40 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-[#EAF0EC] text-[#1B3227] rounded-[15px] flex items-center justify-center">
                  <MapPin size={18} />
                </div>

                <h4
                  className="text-[#4E5C55] font-semibold text-[16px] md:text-[18px] tracking-widest uppercase"
                  style={{ fontFamily: "DM Serif Display" }}
                >
                  Find Us On The Map
                </h4>
              </div>

              <div className="flex-1 rounded-2xl overflow-hidden bg-[#F3F3F3]">
                <iframe
                  title="Susruta Hospital Location"
                  src="https://maps.google.com/maps?q=13.6353669,79.4158754&z=17&output=embed"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: "240px" }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleBookClick}
              className="px-8 py-3.5 text-[14px] md:text-[16px] bg-[#D95B2F] text-[#FFFFFF] rounded-[10px] shadow-lg hover:bg-[#D95B2F]/90 transition-all font-semibold"
              
            >
              Book Appointment
            </button>
          </div>
        </div>
      </SC>
    </section>
  );
}
