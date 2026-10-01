import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { t as tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CalendarCheck } from "lucide-react";

import {
  UserRoundPlus,
  CalendarHeart,
} from "lucide-react";
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

  // ───────────────── HERO TEXT AUTO CHANGE ─────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHeroText((prev) => (prev + 1) % HERO_TEXTS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="home"
      className="
        relative
        min-h-[780px]
        lg:min-h-[790px]
        bg-[#F5F2E9]
        w-full
      "
    >
      {/* ───────────────── HERO IMAGE ───────────────── */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src="/hero_img.png"
          alt="Susruta Hospital Ayurvedic Care"
          className="
            absolute
            inset-0
            w-full
            h-full
            object-cover
            object-center
          "
        />

        {/* ───────────── LEFT CONTENT OVERLAY ───────────── */}
        <div
          className="
            absolute
            inset-0
          "
          style={{
            background: `
              linear-gradient(
                90deg,
                #F5F2E9 0%,
                #F5F2E9 28%,
                rgba(245,242,233,0.98) 40%,
                rgba(245,242,233,0.88) 50%,
                rgba(245,242,233,0.55) 65%,
                rgba(245,242,233,0.15) 80%,
                rgba(245,242,233,0) 100%
              )
            `,
          }}
        />

        {/* ───────────── MOBILE OVERLAY ───────────── */}
        <div
          className="
            absolute
            inset-0
            md:hidden
          "
          style={{
            background: `
              linear-gradient(
                180deg,
                rgba(245,242,233,0.98) 0%,
                rgba(245,242,233,0.92) 45%,
                rgba(245,242,233,0.50) 72%,
                rgba(245,242,233,0.15) 100%
              )
            `,
          }}
        />

        {/* ───────────── BOTTOM FADE ───────────── */}
        <div
          className="
            absolute
            inset-x-0
            bottom-0
            h-48
          "
          style={{
            background:
              "linear-gradient(to top, #F5F2E9 0%, rgba(245,242,233,0) 100%)",
          }}
        />
      </div>

      {/* ───────────────── MAIN CONTENT ───────────────── */}
      <div
        className="
          relative
          z-10
          min-h-[780px]
          lg:min-h-[790px]
          flex
          items-center
          w-full
          pl-6
          md:pl-12
          lg:pl-20
          pr-6
        "
      >
        <div
          className="
            w-full
            max-w-[720px]
            pt-12
            pb-44
            md:pt-16
            lg:pt-16
          "
        >
          {/* ───────────── EYEBROW ───────────── */}
          <motion.div
            initial={{
              opacity: 0,
              y: 20,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.6,
            }}
            className="
              mb-3
              md:mb-7
              text-[#AB6342]
              uppercase
              text-[13px] md:text-[14px] lg:text-[15px]
              tracking-[2.5px]
            "
            style={{
              fontWeight: 700,
              lineHeight: "18px",
            }}
          >
            Authentic Ayurvedic Healing
          </motion.div>

          {/* ───────────── ANIMATED HEADING ───────────── */}
          <div
            className="
              relative
              min-h-[125px]
              md:min-h-[135px]
              lg:min-h-[150px]
              mb-1
            "
          >
            <AnimatePresence mode="wait">
              <motion.h1
                key={activeHeroText}
                initial={{
                  opacity: 0,
                  y: 35,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: -35,
                }}
                transition={{
                  duration: 0.8,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="
                  absolute
                  left-0
                  top-0
                  text-[#0A2B21]
                  text-[38px]
                  md:text-[54px]
                  lg:text-[64px]
                  leading-[1.04]
                  font-semibold
                  w-full
                "
                style={{
                  fontFamily: "DM Serif Display",
                  letterSpacing: "-1px",
                }}
              >
                {HERO_TEXTS[activeHeroText][lang]}
              </motion.h1>
            </AnimatePresence>
          </div>

          {/* ───────────── DESCRIPTION ───────────── */}
          <motion.p
            initial={{
              opacity: 0,
              y: 15,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              delay: 0.25,
              duration: 0.7,
            }}
            className="
              max-w-[620px]
              text-[#4E5C55]
              text-[16px]
              md:text-[17px]
              lg:text-[18px]
              leading-[25px]
              md:leading-[29px]
              mb-7
              md:mb-9
            "
          >
            Led by Dr. P. Murali Krishna — Gold Medalist, Ph.D., and former
            Principal of S.V. Ayurvedic College — bringing three decades of
            authentic healing to Tirupati.
          </motion.p>

          {/* ───────────── CTA ───────────── */}
          <motion.div
            initial={{
              opacity: 0,
              y: 15,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              delay: 0.4,
              duration: 0.6,
            }}
          >
            <button
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("open-booking-modal")
                )
              }
              className="
                group
                inline-flex
                items-center
                justify-center
                gap-3
                px-7
                md:px-8
                py-3.5
                md:py-4
                bg-[#D95B2F]
                text-white
                rounded-[10px]
                text-[14px]
                md:text-[16px]
                shadow-lg
                shadow-[#D95B2F]/20
                hover:bg-[#c84f28]
                hover:-translate-y-0.5
                transition-all
              "
              style={{
                fontWeight: 600,
              }}
            >
              Book Appointment
            </button>
          </motion.div>
        </div>
      </div>

      {/* ───────────────── FLOATING STATS CARD ───────────────── */}
      <div
        className="
          absolute
          z-10
          left-6
          md:left-12
          lg:left-16
          right-6
          md:right-12
          lg:right-16
          bottom-[-53px]
        "
      >
        <div
          className="
            bg-[#FDFDFD]
            rounded-[22px]
            md:rounded-[25px]
            border
            shadow-none
            px-4
            md:px-6
            lg:px-8
            py-6
            md:py-7
            w-full
          "
        >
          <div
            className="
              grid
              grid-cols-2
              lg:grid-cols-4
              gap-y-7
              lg:gap-y-0
            "
          >
            {[
              {
                num: "30+",
                label: "YEARS OF EXPERIENCE",
              },
              {
                num: "10+",
                label: "NATIONAL AWARDS",
              },
              {
                num: "30+",
                label: "PUBLICATIONS",
              },
              {
                num: "147+",
                label: "LECTURES GIVEN",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className="
                  text-center
                  px-2
                  lg:px-4
                "
              >
                <div
                  className="
                    text-[#15392D]
                    text-[36px]
                    md:text-[44px]
                    lg:text-[48px]
                    mb-1
                  "
                  style={{
                    fontFamily: "DM Serif Display",
                    lineHeight: "1",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {stat.num}
                </div>

                <div
                  className="
                    text-[#4E5C55]
                    text-[10px]
                    md:text-[12px]
                    uppercase
                  "
                  style={{
                    fontWeight: 600,
                    lineHeight: "16px",
                    letterSpacing: "1.5px",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


// ─── ABOUT ─────────────────────────────────────────────────────

function AboutSection({ lang }: { lang: "en" | "te" }) {
  return (
    <section
      id="about"
      className="
        relative
        py-20
        md:py-24
        lg:py-28
        pt-30 
        md:pt-33
        lg:pt-33
        bg-[#F5F2E9]
        overflow-hidden
      "
    >
      <SC>
        <div className="max-w-[1240px] mx-auto px-5 md:px-8">

          {/* ───────────────── SECTION HEADING ───────────────── */}
          <Reveal className="text-center max-w-[1100px] mx-auto mb-12 md:mb-16">
            <div
              className="
                text-[#AB6342]
                uppercase
                text-[13px] md:text-[14px] lg:text-[15px]
                mb-4
              "
              style={{
                fontWeight: 700,
                lineHeight: "18px",
                letterSpacing: "2.5px",
              }}
            >
              About The Doctor
            </div>

            <h2
              className="
                text-[#101A2D]
                text-[30px]
                md:text-[44px]
                
                font-semibold
                mb-4
              "
              style={{
                fontFamily: "DM Serif Display",
                lineHeight: "1.08",
                letterSpacing: "-0.8px",
              }}
            >
              Meet Dr. P. Murali Krishna
            </h2>

            <p
              className="
                max-w-[1000px]
                mx-auto
                text-[#4E5C55]
                text-[18px]
                md:text-[20px]
                leading-[24px]
                md:leading-[27px]
              "
            >
              Dr. P. Murali Krishna is a highly distinguished Ayurvedic
              Physician, Academician and Researcher. He served as Principal of
              the prestigious S.V. Ayurvedic College, T.T. Devasthanams,
              Tirupati, guiding generations of scholars and clinical
              practitioners.
            </p>
          </Reveal>


          {/* ───────────────── MAIN GRID ───────────────── */}
          <div
            className="
              grid
              grid-cols-1
              lg:grid-cols-[370px_1fr]
              gap-18
              lg:gap-20
              items-start
            "
          >

            {/* ─────────────── LEFT PHOTO ─────────────── */}
            <Reveal direction="left" className="relative pt-7 w-[370px] max-w-full mx-auto">

              {/* ───────────── ORANGE OFFSET SHAPE ───────────── */}
              <div
                className="
                  absolute
                  z-0
                  right-[-10px]
                  md:right-[-15px]
                  top-[95px]
                  w-[89%]
                  h-[78%]
                  md:h-[84%]
                  bg-[#D95B2F]
                  rounded-[48px]
                  rotate-[7deg]
                  opacity-95
                  border-[4px]
                  border-gray-300
                "
              />


              {/* ───────────── DOCTOR IMAGE ───────────── */}
              <div
                className="
                  relative
                  z-10
                 w-full
                  h-[350px]
                  md:h-[470px]
                  lg:h-[470px]
                  rounded-[38px]
                  overflow-hidden
                  border-[4px]
                  border-white
                  bg-[#F5F2E9]
                  transition-transform duration-500 hover:scale-[1.02]
                "
              >
                <img
                  src={drPhoto}
                  alt="Dr. P. Murali Krishna"
                  className="
                    absolute
                    inset-0
                    w-full
                    h-full
                    object-cover md:object-contain
                    object-center
                  "
                />
              </div>


              {/* ───────────── TOP AWARD BADGE ───────────── */}
              <div
                className="
                  absolute
                  z-20
                  top-0
                  left-[-40px]
                  md:left-[-54px]
                  bg-white
                  rounded-[18px]
                  px-4
                  py-1.5
                  border
                  border-[#F1CFC1]
                  shadow-[0_8px_25px_rgba(20,40,30,0.10)]
                  text-center
                "
              >
                <div
                  className="
                    text-[#D95B2F]
                    text-[18px]
                    md:text-[20px]
                    font-semibold
                  "
                  style={{
                    fontFamily: "DM Serif Display",
                  }}
                >
                  30+
                </div>

                <div
                  className="
                    text-[#4E5C55]
                    text-[10px]
                    whitespace-nowrap
                  "
                >
                  Years of Experience
                </div>
              </div>


              {/* ───────────── RIGHT AWARD BADGE ───────────── */}
              <div
                className="
                  absolute
                  z-20
                  right-[-35px]
                  md:right-[-55px]
                  top-[225px]
                  bg-white
                  rounded-[18px]
                  px-4
                  py-1.5
                  border
                  border-[#F1CFC1]
                  shadow-[0_8px_25px_rgba(20,40,30,0.10)]
                  text-center
                "
              >
                <div
                  className="
                    text-[#D95B2F]
                    text-[18px]
                    md:text-[20px]
                    font-semibold
                  "
                  style={{
                    fontFamily: "DM Serif Display",
                  }}
                >
                  10+
                </div>

                <div
                  className="
                    text-[#4E5C55]
                    text-[10px]
                  "
                >
                  Awards
                </div>
              </div>

            </Reveal>


            {/* ─────────────── RIGHT CONTENT ─────────────── */}
            <div className="flex flex-col gap-8">

              {/* ───────────── ACADEMIC CARD ───────────── */}
              <Reveal direction="right" delay={0.1}>
                <div
                  className="
                    bg-white
                    rounded-[20px]
                    border
                    border-[#DDD9CF]
                    p-7
                    shadow-[0_6px_22px_rgba(20,40,30,0.05)]
                    transition-all duration-300
                    hover:shadow-[0_12px_36px_rgba(20,40,30,0.12)]
                    hover:-translate-y-1
                  "
                >
                  <h3
                    className="
                      text-[#101A2D]
                      text-[20px]
                      md:text-[22px]
                      font-semibold
                      mb-4
                    "
                    style={{
                      fontFamily: "DM Serif Display",
                    }}
                  >
                    Academic Brilliance
                  </h3>

                  <p
                    className="
                      text-[#4E5C55]
                      text-[14px]
                      md:text-[16px]
                      leading-[24px]
                      md:leading-[25px]
                    "
                  >
                    His academic journey has been marked by excellence from the
                    start. He completed his B.A.M.S. as a Gold Medalist —
                    receiving two gold medals from the Governor of Andhra Pradesh
                    at Nagarjuna University Convocation in 1988. He then acquired
                    M.D.(Ay), Ph.D.(Ay), F.R.A.V., and a Diploma in Yoga.
                  </p>
                </div>
              </Reveal>


              {/* ───────────── PROFESSIONAL EXPERIENCE ───────────── */}
              <Reveal direction="right" delay={0.2}>
                <div
                  className="
                    bg-white
                    rounded-[20px]
                    border
                    border-[#DDD9CF]
                    p-7
                    shadow-[0_6px_22px_rgba(20,40,30,0.05)]
                    transition-all duration-300
                    hover:shadow-[0_12px_36px_rgba(20,40,30,0.12)]
                    hover:-translate-y-1
                  "
                >
                  <h3
                    className="
                      text-[#101A2D]
                      text-[20px]
                      md:text-[22px]
                      font-semibold
                      mb-5
                    "
                    style={{
                      fontFamily: "DM Serif Display",
                    }}
                  >
                    Professional Experience & Appointments
                  </h3>

                  <ul
                    className="
                      space-y-3.5
                      text-[#4E5C55]
                      text-[14px]
                      md:text-[16px]
                    "
                    style={{
                      lineHeight: "22px",
                    }}
                  >
                    {[
                      {
                        bold: "Principal (Retd.)",
                        text: " — S.V. Ayurvedic College & Hospital, T.T. Devasthanams, Tirupati, AP",
                      },
                      {
                        bold: "Consultant Ayurvedic Specialist",
                        text: " — Susruta Hospital, Tirupati",
                      },
                      {
                        bold: "SBI Authorised",
                        text: " Ayurvedic Doctor",
                      },
                      {
                        bold: "Governing Body Member",
                        text: " — CCRAS, New Delhi (2015–2018)",
                      },
                      {
                        bold: "Key Note Speaker",
                        text: " — First Australasian Conference on Panchakarma & Yoga, Adelaide (2013)",
                      },
                    ].map((item, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-3"
                      >
                        <span
                          className="
                            text-[#D95B2F]
                            text-[16px]
                            mt-[2px]
                            shrink-0
                          "
                        >
                          ✦
                        </span>

                        <span>
                          <strong
                            className="
                              text-[#4A5A70]
                              font-semibold
                            "
                          >
                            {item.bold}
                          </strong>

                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

            </div>
          </div>
        </div>
      </SC>
    </section>
  );
}

// ─── SERVICES ─────────────────────────────────────────────────
function ServicesSection({ lang }: { lang: "en" | "te" }) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const activeCard = hoveredCard ?? selectedCard;

  const services = [
    { image: "/service1.png", title: "Ayurvedic Consultation", desc: "Detailed personal consultation using Nadi Pariksha (Pulse diagnosis) and Prakriti analysis to determine the root cause of ailments." },
    { image: "/service2.png", title: "Panchakarma Therapy", desc: "Authentic detoxification and rejuvenation therapies including Vamana, Virechana, Basti, Nasya, and Raktamokshana." },
    { image: "/service3.png", title: "Chronic Disease Management", desc: "Specialized Ayurvedic protocols for Arthritis, Diabetes, Skin disorders, Respiratory conditions, and Gastrointestinal problems." },
    { image: "/service4.png", title: "Wellness & Rejuvenation", desc: "Rasayana therapies to boost immunity, reduce stress, improve vitality, and promote healthy aging with herbal formulations." },
  ];

  return (
    <section id="services" className="py-20 px-[7%] bg-[#FDFDFD]">
      <SC>
        <Reveal className="text-center w-full mx-auto mb-15">
          <div className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5" style={{ fontWeight: 700,  lineHeight: '17.28px', letterSpacing: '2.53px' }}>
            Our Services
          </div>
          <h2 className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold   mb-3" style={{ fontFamily: 'DM Serif Display',  lineHeight: '48.89px', letterSpacing: '-0.44px' }}>
            Holistic Ayurvedic Care
          </h2>
          <p className="text-[#4E5C55] text-[18px] md:text-[20px] " style={{  lineHeight: '29.25px' }}>
                    Comprehensive treatments tailored to your unique mind-body constitution.          </p>
        </Reveal>
        
        <div className="relative">
          {/* Dummy grid to maintain exact original height on desktop */}
          <div className="hidden lg:grid grid-cols-4 gap-6 invisible pointer-events-none" aria-hidden="true">
            <div className="aspect-[2/3] min-h-[500px]"></div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row gap-6 lg:absolute lg:inset-0">
            {services.map((s, i) => {
              const isHovered = activeCard === i;
              const isAnyHovered = activeCard !== null;
              
              return (
                <div 
                  key={i} 
                  role="button"
                  tabIndex={0}
                  aria-label={s.title}
                  aria-expanded={isHovered}
                  aria-controls={`service-description-${i}`}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setHoveredCard(i);
                  }}
                  onPointerLeave={() => setHoveredCard(null)}
                  onClick={() => setSelectedCard((current) => current === i ? null : i)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCard((current) => current === i ? null : i);
                    }
                  }}
                  className="relative rounded-2xl overflow-hidden aspect-[2/3] lg:aspect-auto lg:h-full group transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] hover:shadow-2xl"
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
                      id={`service-description-${i}`}
                      aria-hidden={!isHovered}
                      className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${isHovered ? 'max-h-[200px] opacity-100 translate-y-0' : 'max-h-0 opacity-0 translate-y-4'}`}
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
  const featuresLeft = [
    {
      icon: (
        <UserRoundPlus
          size={22}
          strokeWidth={1.7}
          className="text-[#D95B2F] group-hover:text-white transition-colors duration-300"
        />
      ),
      title: "Expert Doctor",
      desc:
        "Retired Principal with 3+ decades of experience in clinical Ayurveda and diagnostics.",
    },
    {
      icon: (
        <Leaf
          size={22}
          strokeWidth={1.7}
          className="text-[#D95B2F] group-hover:text-white transition-colors duration-300"
        />
      ),
      title: "Authentic Ayurveda",
      desc:
        "Traditional Panchakarma and genuine herbal treatments tailored to individual constitution.",
    },
  ];

  const featuresRight = [
    {
      icon: (
        <CalendarHeart
          size={22}
          strokeWidth={1.7}
          className="text-[#D95B2F] group-hover:text-white transition-colors duration-300"
        />
      ),
      title: "Easy Booking",
      desc:
        "Check doctor consultation availability and schedule your hospital visit conveniently online.",
    },
    {
      icon: (
        <Award
          size={22}
          strokeWidth={1.7}
          className="text-[#D95B2F] group-hover:text-white transition-colors duration-300"
        />
      ),
      title: "Holistic Lineage",
      desc:
        "Gold Medalist academic excellence combined with CCRAS verified authentic traditional protocols.",
    },
  ];

  return (
    <section
      id="why-susruta"
      className="
        relative
        bg-[#FFFFFF]
        py-20
        overflow-hidden
      "
    >
      <SC>

        {/* ───────────────── SECTION HEADING ───────────────── */}
        <Reveal
          className="
            text-center
            max-w-[900px]
            mx-auto
            mb-12
            md:mb-14
            lg:mb-16
            px-4
          "
        >
          {/* Eyebrow */}
          <div
            className="
              text-[#AB6342]
              text-[13px] md:text-[14px] lg:text-[15px]
              uppercase
              mb-4
            "
            style={{
              fontWeight: 700,
              lineHeight: "18px",
              letterSpacing: "2.5px",
            }}
          >
            Why Susruta
          </div>

          {/* Heading */}
          <h2
            className="
              text-[#0A2B21]
              text-[30px]
              md:text-[44px]
              font-semibold
            "
            style={{
              fontFamily: "DM Serif Display",
              lineHeight: "1.1",
              letterSpacing: "-0.5px",
            }}
          >
            A hospital built on knowledge
          </h2>
        </Reveal>

        {/* ───────────────── MAIN CONTENT ───────────────── */}
        <div
          className="
            max-w-7xl
            mx-auto
            px-5
            md:px-8
            lg:px-0
          "
        >
          <div
            className="
              grid
              grid-cols-1
              lg:grid-cols-[1fr_450px_1fr]
              gap-x-8
              lg:gap-x-10
              items-center
            "
          >

            {/* ═════════════════ LEFT CONTENT ═════════════════ */}
            <div
              className="
                flex
                flex-col
                gap-12
                lg:gap-16
                order-2
                lg:order-1
              "
            >
              {featuresLeft.map((feature, index) => (
                <Reveal key={index} direction="left" delay={index * 0.15}>
                  <div
                    className="
                      text-center
                      lg:text-right
                      flex
                      flex-col
                      items-center
                      lg:items-end
                      group
                      cursor-default
                    "
                  >
                    {/* Icon */}
                    <div
                      className="
                        w-10
                        h-10
                        rounded-[14px]
                        border
                        border-[#D95B2F33]
                        bg-[#D95B2F1A]
                        flex
                        items-center
                        justify-center
                        mb-4
                        transition-all duration-300
                        group-hover:bg-[#D95B2F]
                        group-hover:border-[#D95B2F]
                        group-hover:scale-110
                      "
                    >
                      {feature.icon}
                    </div>

                    {/* Title */}
                    <h3
                      className="
                        text-[#0A2B21]
                        text-[18px]
                        md:text-[20px]
                        font-semibold
                        mb-2
                        transition-colors duration-300
                        group-hover:text-[#D95B2F]
                      "
                      style={{
                        fontFamily: "DM Serif Display",
                        lineHeight: "28px",
                      }}
                    >
                      {feature.title}
                    </h3>

                    {/* Description */}
                    <p
                      className="
                        max-w-[330px]
                        text-[#4E5C55]
                        text-[14px]
                        md:text-[16px]
                      "
                      style={{
                        lineHeight: "22px",
                      }}
                    >
                      {feature.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* ═════════════════ CENTER IMAGE ═════════════════ */}
            <Reveal
              className="
                relative
                order-1
                lg:order-2
                flex
                justify-center
                mb-12
                lg:mb-0
              "
            >

              {/* Hospital Image */}
              <div
                className="
                  relative
                  z-10
                  w-auto
                  h-[360px]
                  lg:w-[400px]
                  md:h-[440px]
                  rounded-[24px]
                  overflow-hidden
                  bg-[#F5F2E9]
                  transition-all duration-500
                  hover:scale-[1.03]
                  hover:shadow-2xl
                "
              >
                <img
                  src="/hospital.png"
                  alt="Susruta Hospital"
                  className="
                    w-full
                    h-full
                    object-cover
                    object-center
                  "
                />
              </div>

            </Reveal>

            {/* ═════════════════ RIGHT CONTENT ═════════════════ */}
            <div
              className="
                flex
                flex-col
                gap-12
                lg:gap-16
                order-3
              "
            >
              {featuresRight.map((feature, index) => (
                <Reveal key={index} direction="right" delay={index * 0.15}>
                  <div
                    className="
                      text-center
                      lg:text-left
                      flex
                      flex-col
                      items-center
                      lg:items-start
                      group
                      cursor-default
                    "
                  >
                    {/* Icon */}
                    <div
                      className="
                        w-10
                        h-10
                        rounded-[14px]
                        border
                        border-[#D95B2F33]
                        bg-[#D95B2F1A]
                        flex
                        items-center
                        justify-center
                        mb-4
                        transition-all duration-300
                        group-hover:bg-[#D95B2F]
                        group-hover:border-[#D95B2F]
                        group-hover:scale-110
                      "
                    >
                      {feature.icon}
                    </div>

                    {/* Title */}
                    <h3
                      className="
                        text-[#0A2B21]
                        text-[18px]
                        md:text-[20px]
                        font-semibold
                        mb-2
                        transition-colors duration-300
                        group-hover:text-[#D95B2F]
                      "
                      style={{
                        fontFamily: "DM Serif Display",
                        lineHeight: "28px",
                      }}
                    >
                      {feature.title}
                    </h3>

                    {/* Description */}
                    <p
                      className="
                        max-w-[330px]
                        text-[#4E5C55]
                        text-[14px]
                        md:text-[16px]
                      "
                      style={{
                        lineHeight: "22px",
                      }}
                    >
                      {feature.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>

          </div>
        </div>

      </SC>
    </section>
  );
}


// ─── ACHIEVEMENTS ─────────────────────────────────────────────
export function AchievementsSection({ lang }: { lang: "en" | "te" }) {
  const awards = [
    {
      year: "1985",
      en: {
        title: "AP State Medal",
        inst: "Best scientific paper on 'Ayurvedic Approach to Skin Diseases', Vijayawada",
      },
      te: {
        title: "ఏపీ రాష్ట్ర పతకం",
        inst: "విజయవాడలో 'చర్మ వ్యాధులకు ఆయుర్వేద విధానం'పై ఉత్తమ శాస్త్రీయ పత్రం",
      },
    },
    {
      year: "1986",
      en: {
        title: "Chavali Ramaiah Memorial Gold Medal",
        inst: "Nagarjuna University — outstanding performance in final B.A.M.S.",
      },
      te: {
        title: "చావలి రమయ్య స్మారక బంగారు పతకం",
        inst: "నాగార్జున విశ్వవిద్యాలయం — చివరి B.A.M.S.లో అత్యుత్తమ ప్రదర్శన",
      },
    },
    {
      year: "1986",
      en: {
        title: "Achanta Lakshmipathi Memorial Gold Medal",
        inst: "Nagarjuna University — outstanding performance across all five B.A.M.S. years",
      },
      te: {
        title: "అచంట లక్ష్మీపతి స్మారక బంగారు పతకం",
        inst: "నాగార్జున విశ్వవిద్యాలయం — అన్ని ఐదు B.A.M.S. సంవత్సరాలలో శ్రేష్ఠ ప్రదర్శన",
      },
    },
    {
      year: "1992",
      en: {
        title: "Baidyanath Foundation National Award",
        inst: "Best scientific paper on 'Scientific basis of Ayurvedic Diagnostics', Nagpur",
      },
      te: {
        title: "బైద్యనాథ్ ఫౌండేషన్ జాతీయ అవార్డు",
        inst: "నాగ్‌పూర్‌లో 'ఆయుర్వేద నిర్ధారణ యొక్క శాస్త్రీయ ఆధారం'పై ఉత్తమ పత్రం",
      },
    },
    {
      year: "1997",
      en: {
        title: "Doctor of Science Honour",
        inst: "Open International University for Complementary Medicine, Colombo",
      },
      te: {
        title: "డాక్టర్ ఆఫ్ సైన్స్ గౌరవం",
        inst: "ఓపెన్ ఇంటర్నేషనల్ యూనివర్సిటీ ఫర్ కాంప్లిమెంటరీ మెడిసిన్, కొలంబో",
      },
    },
    {
      year: "2006",
      en: {
        title: "Outstanding Young Person — JCI",
        inst: "JCI South East Zone — Coastal AP and Orissa",
      },
      te: {
        title: "అత్యుత్తమ యువ వ్యక్తి — జెసిఐ",
        inst: "జెసిఐ సౌత్ ఈస్ట్ జోన్ — కోస్టల్ ఏపీ మరియు ఒరిస్సా",
      },
    },
    {
      year: "2006",
      en: {
        title: "Outstanding Young Indian — JCI National",
        inst: "Junior Chamber International India — National Award, Bangalore",
      },
      te: {
        title: "అత్యుత్తమ యువ భారతీయుడు — జెసిఐ జాతీయ",
        inst: "జూనియర్ ఛాంబర్ ఇంటర్నేషనల్ ఇండియా — జాతీయ అవార్డు, బెంగళూరు",
      },
    },
    {
      year: "2016",
      en: {
        title: "Dhanvantari Award",
        inst: "Outstanding services in Ayurveda, Vijayawada",
      },
      te: {
        title: "ధన్వంతరి అవార్డు",
        inst: "విజయవాడలో ఆయుర్వేదంలో అత్యుత్తమ సేవలు",
      },
    },
    {
      year: "2017",
      en: {
        title: "International Charaka Award",
        inst: "AAPNA, USA — excellence in Ayurvedic teaching, Belagavi",
      },
      te: {
        title: "అంతర్జాతీయ చరక అవార్డు",
        inst: "ఎఎపిఎన్ఎ, యుఎస్ఎ — ఆయుర్వేద బోధనలో శ్రేష్ఠత",
      },
    },
    {
      year: "2023",
      en: {
        title: "Ayurveda Sarvabhouma Award",
        inst: "National Sanskrit University, Tirupati",
      },
      te: {
        title: "ఆయుర్వేద సార్వభౌమ అవార్డు",
        inst: "జాతీయ సంస్కృత విశ్వవిద్యాలయం, తిరుపతి",
      },
    },
    {
      year: "2026",
      en: {
        title: "Best Doctor Award",
        inst: "",
      },
      te: {
        title: "ఉత్తమ వైద్యుడు అవార్డు",
        inst: "",
      },
    },
  ];

  // Pagination states for different screen sizes
  const [currentStartMobile, setCurrentStartMobile] = useState(0);
  const [currentStartMd, setCurrentStartMd] = useState(0);
  const [currentStartLg, setCurrentStartLg] = useState(0);

  const [direction, setDirection] = useState(1);
  const [animationKey, setAnimationKey] = useState(0);

  const maxMobile = awards.length - 1;

  // Mobile Handlers (1 card jump)
  const goPreviousMobile = () => {
    if (currentStartMobile <= 0) return;
    setDirection(-1);
    setCurrentStartMobile((prev) => Math.max(0, prev - 1));
  };

  const goNextMobile = () => {
    if (currentStartMobile >= maxMobile) return;
    setDirection(1);
    setCurrentStartMobile((prev) => Math.min(maxMobile, prev + 1));
  };

  // Medium Screen Handlers (3 cards jump)
  const goPreviousMd = () => {
    if (currentStartMd <= 0) return;
    setDirection(-1);
    setCurrentStartMd((prev) => Math.max(0, prev - 3));
    setAnimationKey((prev) => prev + 1);
  };

  const goNextMd = () => {
    if (currentStartMd + 3 >= awards.length) return;
    setDirection(1);
    setCurrentStartMd((prev) => prev + 3);
    setAnimationKey((prev) => prev + 1);
  };

  // Large Screen Handlers (5 cards jump)
  const goPreviousLg = () => {
    if (currentStartLg <= 0) return;
    setDirection(-1);
    setCurrentStartLg((prev) => Math.max(0, prev - 5));
    setAnimationKey((prev) => prev + 1);
  };

  const goNextLg = () => {
    if (currentStartLg + 5 >= awards.length) return;
    setDirection(1);
    setCurrentStartLg((prev) => prev + 5);
    setAnimationKey((prev) => prev + 1);
  };

  const visibleAwardsLg = awards.slice(currentStartLg, currentStartLg + 5);
  const visibleAwardsMd = awards.slice(currentStartMd, currentStartMd + 3);

  return (
    <section
      id="achievements"
      className="
        pt-20
        md:pt-24
        pb-16
        bg-[#F5F2E9]
        overflow-hidden
      "
    >
      {/* ───────────────── HEADER ───────────────── */}
      <div
        className="
          text-center
          max-w-3xl
          mx-auto
          mb-10
          md:mb-14
          px-4
        "
      >
        <div
          className="
            text-[#AB6342]
            text-[13px] md:text-[14px] lg:text-[15px]
            uppercase
            mb-5
          "
          style={{
            fontWeight: 700,
            lineHeight: "17.28px",
            letterSpacing: "2.53px",
          }}
        >
          Awards & Recognitions
        </div>

        <h2
          className="
            text-[#0A2B21]
            text-[30px]
            md:text-[44px]
            font-semibold
            mb-3
          "
          style={{
            fontFamily: "DM Serif Display",
            lineHeight: "48.89px",
            letterSpacing: "-0.44px",
          }}
        >
          A Legacy of Excellence
        </h2>

        <p
          className="
            text-[#4E5C55]
            text-[18px]
            md:text-[20px]
          "
          style={{
            lineHeight: "29.25px",
          }}
        >
          Over four decades of distinguished service to Ayurveda,
          recognised nationally and internationally
        </p>
      </div>

      {/* ───────────────── TIMELINE WRAPPER ───────────────── */}
      <div
        className="
          relative
          w-full
          max-w-[1250px]
          mx-auto
          px-5
          md:px-16
          achievements-timeline
        "
      >
        <style>{`
          .achievements-timeline:hover .award-nav {
            opacity: 1;
            pointer-events: auto;
          }

          .achievements-timeline:hover .award-nav-disabled {
            opacity: 0.3;
            pointer-events: none;
          }
        `}</style>

        {/* ───────────────── LARGE SCREEN (5 CARDS) ───────────────── */}
        <div className="hidden lg:block">
          <button
            type="button"
            onClick={goPreviousLg}
            disabled={currentStartLg <= 0}
            aria-label="Previous awards"
            className={`
              absolute
              left-[-22px]
              top-1/2
              -translate-y-1/2
              z-10
              w-10
              h-10
              rounded-full
              ${
                currentStartLg <= 0
                  ? "bg-[#B9C1BC] text-white award-nav-disabled"
                  : "bg-[#D95B2F] text-white award-nav"
              }
              flex
              items-center
              justify-center
              shadow-md
              transition-transform
              duration-200
              ${
                currentStartLg > 0
                  ? "hover:bg-[#D95B2F] hover:scale-105 active:scale-95"
                  : ""
              }
              cursor-pointer
              opacity-0
              pointer-events-none
            `}
          >
            <ChevronLeft size={22} />
          </button>

          <button
            type="button"
            onClick={goNextLg}
            disabled={currentStartLg + 5 >= awards.length}
            aria-label="Next awards"
            className={`
              absolute
              right-[-22px]
              top-1/2
              -translate-y-1/2
              z-10
              w-10
              h-10
              rounded-full
              ${
                currentStartLg + 5 >= awards.length
                  ? "bg-[#B9C1BC] text-white award-nav-disabled"
                  : "bg-[#D95B2F] text-white award-nav"
              }
              flex
              items-center
              justify-center
              shadow-md
              transition-transform
              duration-200
              ${
                currentStartLg + 5 < awards.length
                  ? "hover:bg-[#D95B2F] hover:scale-105 active:scale-95"
                  : ""
              }
              cursor-pointer
              opacity-0
              pointer-events-none
            `}
          >
            <ChevronRight size={22} />
          </button>

          <div className="relative h-[500px] overflow-visible">
            {visibleAwardsLg.length > 1 && (
              <div className="absolute left-[2%] right-[2%] top-0 h-[180px] pointer-events-none z-0">
                <svg viewBox="0 0 1000 180" preserveAspectRatio="none" className="w-full h-full">
                  <motion.path
                    key={animationKey}
                    d="
                      M 0 90
                      C 30 78, 60 62, 93 62
                      C 165 62, 220 139, 298 139
                      C 370 139, 425 62, 503 62
                      C 575 62, 630 139, 708 139
                      C 780 139, 835 62, 913 62
                      C 945 62, 975 78, 1000 90
                    "
                    fill="none"
                    stroke="#D95B2F"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{
                      delay: 0.5,
                      pathLength: { duration: 2.5, ease: "easeInOut" },
                      opacity: { duration: 0.25 },
                    }}
                  />
                </svg>
              </div>
            )}

            <div className="relative z-10 grid grid-cols-5 gap-7 h-full w-full">
              {visibleAwardsLg.map((award, index) => {
                const isTop = index % 2 === 0;
                return (
                  <div key={`lg-${currentStartLg}-${index}-${award.year}`} className="relative h-[450px]">
                    <motion.div
                      initial={{ opacity: 0, y: isTop ? -10 : 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.3 + index * 0.15, duration: 0.5, ease: "easeOut" }}
                      className={`absolute left-1/2 -translate-x-1/2 z-30 ${isTop ? "top-[5px]" : "top-[82px]"}`}
                    >
                      <span className="inline-flex items-center justify-center min-w-[48px] px-3 py-1 rounded-full bg-[#D95B2F1A] text-[#D95B2F] text-[12px] font-semibold">
                        {award.year}
                      </span>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.3 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.4 + index * 0.15, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                      className={`absolute left-1/2 -translate-x-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md ${
                        isTop ? "top-[42px] bg-[#D95B2F]" : "top-[119px] bg-[#183C32]"
                      }`}
                    >
                      <Trophy size={17} />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: isTop ? -20 : 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.5 + index * 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      className={`award-card absolute left-0 right-0 ${
                        isTop ? "top-[103px]" : "top-[180px]"
                      } bg-white rounded-[22px] border border-[#DDD9CF]/70 px-6 py-6 min-h-[205px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
                    >
                      <h4 className="text-[#0A2B21] text-[18px] md:text-[20px] font-semibold leading-[23px] mb-4" style={{ fontFamily: "DM Serif Display" }}>
                        {award[lang].title}
                      </h4>
                      {award[lang].inst && (
                        <p className="text-[#4E5C55] text-[14px] md:text-[16px] leading-[21px]">
                          {award[lang].inst}
                        </p>
                      )}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-[-18px] relative z-30">
            {Array.from({ length: Math.ceil(awards.length / 5) }).map((_, dot) => {
              const target = dot * 5;
              const activeDot = Math.floor(currentStartLg / 5);
              return (
                <button
                  key={dot}
                  type="button"
                  aria-label={`Go to awards group ${dot + 1}`}
                  onClick={() => {
                    setCurrentStartLg(target);
                    setAnimationKey((prev) => prev + 1);
                  }}
                  className={`rounded-full transition-all duration-300 ${
                    activeDot === dot ? "w-[18px] h-[7px] bg-[#D95B2F]" : "w-[7px] h-[7px] bg-[#D9D9D9]"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* ───────────────── MEDIUM SCREEN (3 CARDS) ───────────────── */}
        <div className="hidden md:block lg:hidden">
          <button
            type="button"
            onClick={goPreviousMd}
            disabled={currentStartMd <= 0}
            aria-label="Previous awards"
            className={`
              absolute
              left-2
              top-1/2
              -translate-y-1/2
              z-20
              w-10
              h-10
              rounded-full
              ${
                currentStartMd <= 0
                  ? "bg-[#B9C1BC] text-white award-nav-disabled"
                  : "bg-[#D95B2F] text-white award-nav"
              }
              flex
              items-center
              justify-center
              shadow-md
              transition-transform
              duration-200
              ${
                currentStartMd > 0
                  ? "hover:bg-[#D95B2F] hover:scale-105 active:scale-95"
                  : ""
              }
              cursor-pointer
              opacity-0
              pointer-events-none
            `}
          >
            <ChevronLeft size={22} />
          </button>

          <button
            type="button"
            onClick={goNextMd}
            disabled={currentStartMd + 3 >= awards.length}
            aria-label="Next awards"
            className={`
              absolute
              right-2
              top-1/2
              -translate-y-1/2
              z-20
              w-10
              h-10
              rounded-full
              ${
                currentStartMd + 3 >= awards.length
                  ? "bg-[#B9C1BC] text-white award-nav-disabled"
                  : "bg-[#D95B2F] text-white award-nav"
              }
              flex
              items-center
              justify-center
              shadow-md
              transition-transform
              duration-200
              ${
                currentStartMd + 3 < awards.length
                  ? "hover:bg-[#D95B2F] hover:scale-105 active:scale-95"
                  : ""
              }
              cursor-pointer
              opacity-0
              pointer-events-none
            `}
          >
            <ChevronRight size={22} />
          </button>

          <div className="relative h-[500px] overflow-visible">
            {/* MD Timeline Line */}
            {visibleAwardsMd.length > 1 && (
              <div className="absolute left-[calc((100%-48px)/6)] right-[calc((100%-48px)/6)] top-0 h-[180px] pointer-events-none z-0">
                <svg
                  viewBox="0 0 1000 180"
                  preserveAspectRatio="none"
                  className="w-full h-full overflow-visible"
                >
                  <motion.path
                    key={animationKey}
                    d={`
                      M -100 85
                      C -70 78, -35 62, 0 62
                      C 175 62, 325 139, 500 139
                      ${visibleAwardsMd.length > 2 ? `
                        C 675 139, 825 62, 1000 62
                        C 1035 62, 1070 78, 1100 85
                      ` : ""}
                    `}
                    vectorEffect="non-scaling-stroke"
                    fill="none"
                    stroke="#D95B2F"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{
                      pathLength: { duration: 1.8, ease: "easeInOut" },
                      opacity: { duration: 0.25 },
                    }}
                  />
                </svg>
              </div>
            )}

            <div className="relative z-10 grid grid-cols-3 gap-6 h-full w-full">
              {visibleAwardsMd.map((award, index) => {
                const isTop = index % 2 === 0;
                return (
                  <div key={`md-${currentStartMd}-${index}-${award.year}`} className="relative h-[450px]">
                    <motion.div
                      initial={{ opacity: 0, y: isTop ? -10 : 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.3 + index * 0.15, duration: 0.5, ease: "easeOut" }}
                      className={`absolute left-1/2 -translate-x-1/2 z-30 ${isTop ? "top-[5px]" : "top-[82px]"}`}
                    >
                      <span className="inline-flex items-center justify-center min-w-[48px] px-3 py-1 rounded-full bg-[#D95B2F1A] text-[#D95B2F] text-[12px] font-semibold">
                        {award.year}
                      </span>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.3 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.4 + index * 0.15, duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                      className={`absolute left-1/2 -translate-x-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md ${
                        isTop ? "top-[42px] bg-[#D95B2F]" : "top-[119px] bg-[#183C32]"
                      }`}
                    >
                      <Trophy size={17} />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: isTop ? -20 : 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ delay: 0.5 + index * 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                      className={`award-card absolute left-0 right-0 ${
                        isTop ? "top-[103px]" : "top-[180px]"
                      } bg-white rounded-[22px] border border-[#DDD9CF]/70 px-6 py-6 min-h-[205px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
                    >
                      <h4 className="text-[#0A2B21] text-[18px] font-semibold leading-[23px] mb-4" style={{ fontFamily: "DM Serif Display" }}>
                        {award[lang].title}
                      </h4>
                      {award[lang].inst && (
                        <p className="text-[#4E5C55] text-[14px] leading-[21px]">
                          {award[lang].inst}
                        </p>
                      )}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-[-18px] relative z-30">
            {Array.from({ length: Math.ceil(awards.length / 3) }).map((_, dot) => {
              const target = dot * 3;
              const activeDot = Math.floor(currentStartMd / 3);
              return (
                <button
                  key={dot}
                  type="button"
                  aria-label={`Go to awards group ${dot + 1}`}
                  onClick={() => {
                    setCurrentStartMd(target);
                    setAnimationKey((prev) => prev + 1);
                  }}
                  className={`rounded-full transition-all duration-300 ${
                    activeDot === dot ? "w-[18px] h-[7px] bg-[#D95B2F]" : "w-[7px] h-[7px] bg-[#D9D9D9]"
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* ───────────────── MOBILE SCREEN (1 CARD) ───────────────── */}
        <div className="md:hidden">
          <div className="relative">
            {/* Mobile year */}
            <motion.div
              key={`mobile-year-${currentStartMobile}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="flex justify-center mb-3"
            >
              <span className="px-3 py-1 rounded-full bg-[#D95B2F1A] text-[#D95B2F] text-xs font-semibold">
                {awards[currentStartMobile].year}
              </span>
            </motion.div>

            {/* Mobile trophy */}
            <motion.div
              key={`mobile-trophy-${currentStartMobile}`}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45 }}
              className="relative z-10 w-10 h-10 mx-auto rounded-full bg-[#D95B2F] text-white flex items-center justify-center shadow-md"
            >
              <Trophy size={17} />
            </motion.div>

            {/* Curved connector through the trophy, matching the desktop timeline. */}
            <svg
              viewBox="0 0 1000 76"
              preserveAspectRatio="none"
              className="absolute inset-x-0 top-[36px] w-full h-[76px] pointer-events-none"
              aria-hidden="true"
            >
              <path
                d="M 0 48 C 175 48, 325 20, 500 20 C 675 20, 825 48, 1000 48"
                fill="none"
                stroke="#D95B2F"
                strokeWidth="1.2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="h-5" />

            {/* Mobile card */}
            <div className="relative">
            <motion.div
              key={`mobile-card-${currentStartMobile}`}
              initial={{ opacity: 0, x: direction > 0 ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="mx-8 bg-white rounded-[22px] border border-[#DDD9CF]/70 px-5 py-4 min-h-[160px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <h4 className="text-[#0A2B21] text-[19px] font-semibold leading-[25px] mb-3" style={{ fontFamily: "DM Serif Display" }}>
                {awards[currentStartMobile][lang].title}
              </h4>

              {awards[currentStartMobile][lang].inst && (
                <p className="text-[#4E5C55] text-[14px] leading-[21px]">
                  {awards[currentStartMobile][lang].inst}
                </p>
              )}
            </motion.div>

          {/* Mobile arrows */}
          <div className="absolute -inset-x-5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-between pointer-events-none">
            <button
              type="button"
              onClick={goPreviousMobile}
              disabled={currentStartMobile <= 0}
              aria-label="Previous award"
              className={`pointer-events-auto w-10 h-10 rounded-full ${
                currentStartMobile <= 0
                  ? "bg-[#B9C1BC] text-white opacity-40 cursor-not-allowed"
                  : "bg-[#D95B2F] text-white cursor-pointer active:scale-95"
              } flex items-center justify-center shadow-md transition-transform duration-200`}
            >
              <ChevronLeft size={21} />
            </button>

            <button
              type="button"
              onClick={goNextMobile}
              disabled={currentStartMobile >= maxMobile}
              aria-label="Next award"
              className={`pointer-events-auto w-10 h-10 rounded-full ${
                currentStartMobile >= maxMobile
                  ? "bg-[#B9C1BC] text-white opacity-40 cursor-not-allowed"
                  : "bg-[#D95B2F] text-white cursor-pointer active:scale-95"
              } flex items-center justify-center shadow-md transition-transform duration-200`}
            >
              <ChevronRight size={21} />
            </button>
          </div>
            </div>
          </div>

          {/* Mobile indicators */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {awards.map((_, dot) => (
              <button
                key={dot}
                type="button"
                aria-label={`Go to award ${dot + 1}`}
                onClick={() => {
                  setDirection(dot >= currentStartMobile ? 1 : -1);
                  setCurrentStartMobile(dot);
                }}
                className={`rounded-full transition-all duration-300 ${
                  currentStartMobile === dot
                    ? "w-[18px] h-[7px] bg-[#D95B2F]"
                    : "w-[7px] h-[7px] bg-[#D9D9D9]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
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
  const MORNING_TIMES = new Set(["08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
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
                          placeholder = "example@email.com"
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

  const displayTestimonials = (testimonials.length > 0 ? testimonials : fallbackTestimonials) as Array<{ id: number; patientName: string; patientLocation?: string | null; content: string; rating: number; contentTe?: string | null }>;

  // Split into 4 columns
  const numColumns = 4;
  const cols: typeof displayTestimonials[] = Array.from({ length: numColumns }, () => []);
  
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
        <Reveal className="mb-18">
          <div className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5" style={{ fontWeight: 700, lineHeight: '17.28px', letterSpacing: '2.53px' }}>
            Patient Stories
          </div>
          <h2 className="text-[#0A2B21] text-[30px] md:text-[44px] font-semibold mb-3" style={{ fontFamily: 'DM Serif Display',  lineHeight: '48.89px', letterSpacing: '-0.44px' }}>
            Stories from our patients
          </h2>
          <p className="text-[#4E5C55] text-[18px] md:text-[20px]" style={{  lineHeight: '29.25px' }}>
            Honest experiences from people who have received care at Susruta.
          </p>
        </Reveal>

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

  const galleryViewportRef = useRef<HTMLDivElement>(null);
  const gallerySetRef = useRef<HTMLDivElement>(null);
  const [galleryCopies, setGalleryCopies] = useState(2);

  useEffect(() => {
    const viewport = galleryViewportRef.current;
    const imageSet = gallerySetRef.current;
    if (!viewport || !imageSet) return;

    const updateCopies = () => {
      const setWidth = imageSet.getBoundingClientRect().width;
      if (setWidth > 0) {
        // Keep the viewport filled even after one complete set has scrolled away.
        setGalleryCopies(Math.max(2, Math.ceil(viewport.clientWidth / setWidth) + 1));
      }
    };

    updateCopies();
    const observer = new ResizeObserver(updateCopies);
    observer.observe(viewport);
    observer.observe(imageSet);
    return () => observer.disconnect();
  }, []);

  // Replace these paths only if your existing gallery files use different names.
  const galleryImages = [
    "/hospital.png",
    "/hospital_gallery1.png",
    "/hospital_gallery2.png",
    "/hospital_gallery3.png",
  ];

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

  return (
    <section id="contact" className="py-0 bg-[#F5F2E9] overflow-hidden">
      {/* ───────────────── TOP IMAGE GALLERY ───────────────── */}
      <style>
        {`
          @keyframes gallery-continuous-scroll {
            from {
              transform: translate3d(0, 0, 0);
            }

            to {
              transform: translate3d(calc(-100% / var(--gallery-copies)), 0, 0);
            }
          }

          .gallery-continuous-track {
            animation: gallery-continuous-scroll 25s linear infinite;
            will-change: transform;
          }
        `}
      </style>

      <div ref={galleryViewportRef} className="w-full overflow-hidden pt-20 pb-14 md:pb-16">
        <div
          className="gallery-continuous-track flex w-max"
          style={{ "--gallery-copies": galleryCopies } as React.CSSProperties}
        >
          {Array.from({ length: galleryCopies }, (_, copyIndex) => (
            <div
              key={copyIndex}
              ref={copyIndex === 0 ? gallerySetRef : undefined}
              aria-hidden={copyIndex > 0 ? true : undefined}
              className="flex shrink-0 gap-5 md:gap-6 pr-5 md:pr-6"
            >
              {galleryImages.map((image, index) => (
                <div
                  key={image}
                  className="
                    shrink-0
                    w-[255px]
                    h-[250px]
                    md:w-[340px]
                    md:h-[270px]
                    lg:w-[390px]
                    lg:h-[290px]
                    rounded-[18px]
                    overflow-hidden
                    bg-[#E8E4DA]
                    transition-transform
                    duration-500
                    hover:scale-[1.02]
                    hover:shadow-lg
                  "
                >
                  <img
                    src={image}
                    alt={copyIndex === 0 ? `Susruta Hospital gallery ${index + 1}` : ""}
                    draggable={false}
                    loading="eager"
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ───────────────── CONTACT HEADER ───────────────── */}
      <SC>
        <Reveal className="text-center max-w-3xl mx-auto mb-10 md:mb-9 px-4">
          <div
            className="text-[#AB6342] text-[13px] md:text-[14px] lg:text-[15px] uppercase mt-7 mb-4"
            style={{
              fontWeight: 700,
              lineHeight: "17.28px",
              letterSpacing: "2.53px",
            }}
          >
            Contact Us
          </div>

          <h2
            className="text-[#0A2B21] font-semibold text-[30px] md:text-[44px] mb-2"
            style={{
              fontFamily: "DM Serif Display",
              lineHeight: "1.2",
              letterSpacing: "-0.44px",
            }}
          >
            Get in touch
          </h2>

          <p
            className="text-[#4E5C55] text-[18px] md:text-[20px]"
            style={{ lineHeight: "24px" }}
          >
            We are here to help you. Reach us during working hours
          </p>
        </Reveal>

        {/* ───────────────── CONTACT CONTENT ───────────────── */}
        <div className="max-w-7xl mx-auto px-4 md:px-0 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 items-stretch">
            {/* ───────── LEFT COLUMN ───────── */}
            <div className="flex flex-col gap-4">
              {/* Address */}
              <div className="bg-white rounded-[15px] border border-[#DDD9CF]/60 px-5 py-4 min-h-[84px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex items-center gap-4 h-full">
                  <div className="shrink-0 h-10 w-10 bg-[#FEF3ED] text-[#D95B2F] border border-[#F3CDBB] rounded-[12px] flex items-center justify-center">
                    <MapPin size={18} strokeWidth={1.8} />
                  </div>

                  <div className="min-w-0">
                    <h4
                      className="text-[#1B3227] text-[16px] md:text-[18px] mb-1"
                      style={{
                        fontFamily: "DM Serif Display",
                        letterSpacing: "0.3px",
                      }}
                    >
                      Address
                    </h4>

                    <p className="text-[#1B3227] text-[14px] md:text-[16px] font-semibold leading-5">
                      {settings?.clinicAddress ||
                        "119, Ramulavari North Mada Street, Tirupati - 517 507"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div className="bg-white rounded-[15px] border border-[#DDD9CF]/60 px-5 py-4 min-h-[96px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 h-10 w-10 bg-[#FEF3ED] text-[#D95B2F] border border-[#F3CDBB] rounded-[12px] flex items-center justify-center">
                    <Phone size={18} strokeWidth={1.8} />
                  </div>

                  <div className="min-w-0">
                    <h4
                      className="text-[#1B3227] text-[16px] md:text-[18px] mb-1"
                      style={{
                        fontFamily: "DM Serif Display",
                        letterSpacing: "0.3px",
                      }}
                    >
                      Phone
                    </h4>

                    <p className="text-[#1B3227] text-[14px] md:text-[16px] font-semibold leading-5">
                      {[settings?.clinicPhone1, settings?.clinicPhone2]
                        .filter(Boolean)
                        .join(" · ") || "9492068180 · 0877-2220663"}
                    </p>

                    <p className="text-[#69766F] text-[14px] md:text-[16px] mt-0.5">
                      Please call during office hours only.
                    </p>
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="bg-white rounded-[15px] border border-[#DDD9CF]/60 px-5 py-4 min-h-[84px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex items-center gap-4 h-full">
                  <div className="shrink-0 h-10 w-10 bg-[#FEF3ED] text-[#D95B2F] border border-[#F3CDBB] rounded-[12px] flex items-center justify-center">
                    <Mail size={18} strokeWidth={1.8} />
                  </div>

                  <div className="min-w-0">
                    <h4
                      className="text-[#1B3227] text-[16px] md:text-[18px] mb-1"
                      style={{
                        fontFamily: "DM Serif Display",
                        letterSpacing: "0.3px",
                      }}
                    >
                      Email
                    </h4>

                    <p className="text-[#1B3227] text-[14px] md:text-[16px] font-semibold leading-5 break-words">
                      {settings?.clinicEmail || "reachus@susrutahospital.com"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Working Hours */}
              <div className="bg-white rounded-[15px] border border-[#DDD9CF]/60 px-5 py-5 flex-1 min-h-[220px] transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-[#EEEAE2]">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 h-10 w-10 bg-[#FEF3ED] text-[#D95B2F] border border-[#F3CDBB] rounded-[12px] flex items-center justify-center">
                      <Clock size={18} strokeWidth={1.8} />
                    </div>

                    <h4
                      className="text-[#1B3227] text-[16px] md:text-[18px] leading-tight"
                      style={{
                        fontFamily: "DM Serif Display",
                        letterSpacing: "0.35px",
                      }}
                    >
                      Working Hours
                    </h4>
                  </div>

                  <span
                    className="
                      inline-flex
                      self-start
                      md:self-auto
                      items-center
                      gap-1.5
                      px-3
                      py-1
                      rounded-full
                      border
                      border-[#A7E7C9]
                      bg-[#F0FFF7]
                      text-[#16A36C]
                      text-[11px]
                      md:text-[14px]
                      font-semibold
                      whitespace-nowrap
                      ml-[52px]
                      md:ml-0
                    "
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16C784] shrink-0" />
                    Today ({todayName})
                  </span>
                </div>

                <div className="pt-4">
                  {/* Today's hours */}
                  <div className="bg-[#FEF6EE] border border-[#F3CDBB] text-[#D95B2F] rounded-[11px] px-3 py-3 flex justify-between items-center mb-2.5">
                    <div className="font-medium text-[14px] md:text-[16px]">
                      {todayName === "Monday"
                        ? "Monday (Special Timing)"
                        : todayName}
                    </div>

                    <div className="font-medium text-[14px] md:text-[16px] text-right">
                      <div>10:00 AM – 1:00 PM</div>
                    </div>
                  </div>

                  {/* Monday - Saturday */}
                  <div className="px-1 py-3 border-b border-[#EEEAE2] flex justify-between items-start gap-5">
                    <div className="text-[#33463E] text-[14px] md:text-[16px] font-medium">
                      Monday – Saturday
                    </div>

                    <div className="text-right text-[14px] md:text-[16px] text-[#15392D]">
                      <div className="mb-1.5">10:00 AM – 1:00 PM</div>
                      <div>6:00 PM – 10:00 PM</div>
                    </div>
                  </div>

                  {/* Sunday */}
                  <div className="px-1 py-3 flex justify-between items-center gap-5">
                    <div className="text-[#33463E] text-[14px] md:text-[16px] font-medium">
                      Sunday
                    </div>

                    <div className="text-[#15392D] text-[14px] md:text-[16px]">
                      10:00 AM – 1:00 PM
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ───────── RIGHT MAP ───────── */}
            <div className="bg-white rounded-[15px] border border-[#DDD9CF]/60 p-5 flex flex-col min-h-[100%] transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="shrink-0 h-10 w-10 bg-[#FEF3ED] text-[#D95B2F] border border-[#F3CDBB] rounded-[12px] flex items-center justify-center">
                  <MapPin size={18} strokeWidth={1.8} />
                </div>

                <h4
                  className="text-[#1B3227] text-[16px] md:text-[18px]"
                  style={{
                    fontFamily: "DM Serif Display",
                    letterSpacing: "0.35px",
                  }}
                >
                  Find Us On The Map
                </h4>
              </div>

              <div className="flex-1 min-h-[360px] rounded-[10px] overflow-hidden bg-[#F3F3F3]">
                <iframe
                  title="Susruta Hospital Location"
                  src="https://maps.google.com/maps?q=13.6353669,79.4158754&z=17&output=embed"
                  width="100%"
                  height="100%"
                  style={{
                    border: 0,
                    minHeight: "360px",
                    display: "block",
                  }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ───────────────── CTA ───────────────── */}
        <div className="px-4 md:px-5 pb-16 md:pb-20">
          <div
            className="
              max-w-7xl
              mx-auto
              min-h-[390px]
              md:min-h-[410px]
              rounded-[32px]
              bg-[#103D30]
              flex
              flex-col
              items-center
              justify-center
              text-center
              px-5
              py-16
            "
          >
            <div
              className="text-[#D95B2F] text-[13px] md:text-[14px] lg:text-[15px] uppercase mb-5"
              style={{
                fontWeight: 700,
                lineHeight: "17.28px",
                letterSpacing: "2.53px",
              }}
            >
              Begin Today
            </div>

            <h2
              className="
                text-[#F5F2E9]
                font-semibold
                text-[27px]
                md:text-[44px]
                max-w-[850px]
                mb-3
              "
              style={{
                fontFamily: "DM Serif Display",
                lineHeight: "1.18",
                letterSpacing: "-0.5px",
              }}
            >
              Start Your Journey to a Medicine-Free
              <br className="hidden md:block" />
              {" "}Life with Dr. P. Murali Krishna
            </h2>

            <p
              className="
                text-[#C8D0CA]
                text-[18px]
                md:text-[20px]
                mb-7
              "
              style={{ lineHeight: "29px" }}
            >
              Book your appointment today
            </p>

            <button
              onClick={handleBookClick}
              className="
                px-8
                py-3.5
                bg-[#E65D2F]
                text-white
                rounded-[10px]
                text-[14px]
                md:text-[16px]
                font-semibold
                hover:bg-[#D95B2F]
                transition-all
                duration-200
              "
            >
              Book appointment
            </button>
          </div>
        </div>
      </SC>
    </section>
  );
}
