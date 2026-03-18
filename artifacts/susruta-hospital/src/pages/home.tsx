import React, { useState, useMemo } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
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
  CheckCircle2, ChevronLeft, ChevronRight, Calendar, Info
} from "lucide-react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths } from "date-fns";
import drPhoto from "@assets/Dr_Murali_Krishna_1773837837953.jpeg";

export default function Home() {
  const { lang } = useLanguage();
  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;

  return (
    <PublicLayout>
      <HeroSection lang={lang} t={t} />
      <AboutSection lang={lang} />
      <AchievementsSection lang={lang} />
      <ServicesSection lang={lang} />
      <AppointmentsSection lang={lang} t={t} />
      <TestimonialsSection lang={lang} />
      <ContactSection lang={lang} t={t} />
    </PublicLayout>
  );
}

// ─────────────────────────── HERO ───────────────────────────
function HeroSection({ lang, t }: { lang: string; t: (k: any) => string }) {
  return (
    <section id="home" className="relative pt-20 pb-28 overflow-hidden bg-gradient-to-br from-[#f0f7f0] via-white to-[#e8f5e8]">
      <div className="absolute inset-0 -z-10 opacity-20"
        style={{ backgroundImage: `url(${new URL('../../../public/images/ayurveda-pattern.png', import.meta.url).href})`, backgroundSize: '400px' }}>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

          {/* Text */}
          <div className="flex-1 space-y-7 text-center lg:text-left z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              <Leaf size={15} />
              <span>{lang === "en" ? "Authentic Ayurvedic Healing" : "ప్రామాణికమైన ఆయుర్వేద వైద్యం"}</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-foreground leading-[1.15]">
              {lang === "en" ? (
                <>Experience <span className="text-primary">Nature's</span><br />Touch for Your Health</>
              ) : (
                <>మీ ఆరోగ్యం కోసం<br /><span className="text-primary">ప్రకృతి</span> స్పర్శను అనుభవించండి</>
              )}
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {lang === "en"
                ? "Led by Dr. P. Murali Krishna — Gold Medalist, Ph.D., and former Principal of S.V. Ayurvedic College — bringing three decades of authentic healing to Tirupati."
                : "డాక్టర్ పి. మురళీకృష్ణ గారి నేతృత్వంలో — గోల్డ్ మెడలిస్ట్, పి.హెచ్.డి., మరియు ఎస్.వి. ఆయుర్వేద కళాశాల మాజీ ప్రిన్సిపాల్ — తిరుపతికి మూడు దశాబ్దాల ప్రామాణికమైన వైద్యాన్ని అందిస్తున్నారు."}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <a href="#appointments" onClick={(e) => { e.preventDefault(); document.getElementById("appointments")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="px-8 py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all hover:-translate-y-0.5 text-center">
                {t("btn.book")}
              </a>
              <a href="#about" onClick={(e) => { e.preventDefault(); document.getElementById("about")?.scrollIntoView({ behavior: "smooth" }); }}
                className="px-8 py-3.5 border-2 border-primary/30 text-primary rounded-xl font-bold hover:bg-primary/5 transition-all text-center">
                {lang === "en" ? "Meet the Doctor" : "డాక్టర్‌ ని కలవండి"}
              </a>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 justify-center lg:justify-start pt-4">
              {[
                { num: "30+", label: lang === "en" ? "Years Experience" : "సంవత్సరాల అనుభవం" },
                { num: "10+", label: lang === "en" ? "National Awards" : "జాతీయ అవార్డులు" },
                { num: "147+", label: lang === "en" ? "Lectures Given" : "ఇచ్చిన ఉపన్యాసాలు" },
                { num: "30+", label: lang === "en" ? "Publications" : "ప్రచురణలు" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl font-bold font-serif text-primary">{s.num}</div>
                  <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Doctor Photo */}
          <div className="w-full max-w-xs lg:max-w-sm xl:max-w-md flex-shrink-0 relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-green-200/40 rounded-[3rem] blur-2xl -z-10"></div>
            <div className="rounded-[2.5rem] overflow-hidden border-8 border-white shadow-2xl">
              <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto object-cover" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 text-white">
                <h3 className="font-serif font-bold text-xl">{lang === "en" ? "Dr. P. Murali Krishna" : "డా. పి. మురళీకృష్ణ"}</h3>
                <p className="text-white/80 text-sm">B.A.M.S. (Gold Medalist), M.D.(Ay), Ph.D.(Ay)</p>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 bg-white p-4 rounded-2xl shadow-xl border border-border flex items-center gap-3">
              <div className="bg-yellow-100 p-2.5 rounded-xl text-yellow-600"><Award size={22} /></div>
              <div>
                <p className="font-bold text-sm text-foreground">Gold Medalist</p>
                <p className="text-xs text-muted-foreground">Nagarjuna University</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: <ShieldCheck size={28} />, title: lang === "en" ? "Expert Doctor" : "నిపుణుడైన డాక్టర్", desc: lang === "en" ? "Retired Principal & highly qualified specialist with over 3 decades of experience." : "3 దశాబ్దాలకు పైగా అనుభవంతో విశ్రాంత ప్రిన్సిపాల్ & అత్యంత అర్హులైన నిపుణుడు." },
            { icon: <Leaf size={28} />, title: lang === "en" ? "Authentic Ayurveda" : "ప్రామాణిక ఆయుర్వేదం", desc: lang === "en" ? "Traditional Panchakarma and genuine herbal treatments for chronic and acute ailments." : "దీర్ఘకాలిక వ్యాధులకు సాంప్రదాయ పంచకర్మ మరియు ప్రామాణిక మూలికా చికిత్సలు." },
            { icon: <Clock size={28} />, title: lang === "en" ? "Easy Booking" : "సులభమైన బుకింగ్", desc: lang === "en" ? "Check real-time availability and book your appointment online in minutes." : "నిజ సమయ లభ్యతను తనిఖీ చేసి నిమిషాల్లో మీ అపాయింట్‌మెంట్ ఆన్‌లైన్‌లో బుక్ చేయండి." },
          ].map((f, i) => (
            <div key={i} className={`bg-white p-8 rounded-3xl border border-border/60 shadow-sm flex flex-col items-center text-center gap-4 ${i === 1 ? "border-primary/30 shadow-md shadow-primary/10 -mt-2 md:-mt-6" : ""}`}>
              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${i === 1 ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-primary/10 text-primary"}`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-serif font-bold">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── ABOUT ───────────────────────────
function AboutSection({ lang }: { lang: string }) {
  return (
    <section id="about" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "About The Doctor" : "డాక్టర్ గురించి"}
          title={lang === "en" ? "Meet Vaidya Muralikrishna Parasaram" : "వైద్య మురళీకృష్ణ పరశురామ్"}
          subtitle={lang === "en" ? "A lifetime dedicated to Ayurvedic excellence — academician, researcher, healer." : "ఆయుర్వేద శ్రేష్ఠతకు అంకితమైన జీవితం — శాస్త్రవేత్త, పరిశోధకుడు, వైద్యుడు."}
        />

        <div className="flex flex-col lg:flex-row gap-12 mt-14">
          {/* Photo + credentials */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="sticky top-28">
              <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-white ring-1 ring-border">
                <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto" />
              </div>
              <div className="mt-5 bg-[#f4faf4] border border-primary/20 p-6 rounded-2xl">
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
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                    {lang === "en" ? "Current Position" : "ప్రస్తుత పదవి"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "en" ? "Consultant Ayurvedic Specialist" : "సలహా ఆయుర్వేద నిపుణుడు"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Susruta Hospital, Tirupati</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bio content */}
          <div className="flex-1 prose prose-green max-w-none text-foreground/80">
            <p className="text-lg leading-relaxed mb-6">
              {lang === "en"
                ? "Dr. P. Murali Krishna is a highly distinguished and decorated Ayurvedic Physician, Academician, and Researcher. He served as the Principal of the prestigious S.V. Ayurvedic College, T.T. Devasthanams, Tirupati — one of the most reputed Ayurvedic institutions in Andhra Pradesh."
                : "డాక్టర్ పి. మురళీకృష్ణ అత్యంత గొప్ప మరియు అలంకరించబడిన ఆయుర్వేద వైద్యుడు, శాస్త్రవేత్త మరియు పరిశోధకుడు. ఆంధ్రప్రదేశ్‌లోని అత్యంత ప్రసిద్ధ ఆయుర్వేద సంస్థలలో ఒకటైన శ్రీ వేంకటేశ్వర ఆయుర్వేద కళాశాల, టి.టి. దేవస్థానాలు, తిరుపతిలో ప్రిన్సిపాల్‌గా పనిచేశారు."}
            </p>

            <h3 className="font-serif text-2xl text-foreground font-bold mt-10 mb-4">
              {lang === "en" ? "Academic Brilliance" : "విద్యా వైభవం"}
            </h3>
            <p className="leading-relaxed">
              {lang === "en"
                ? "His academic journey has been marked by excellence from the very start. He completed his B.A.M.S. as a Gold Medalist — receiving two gold medals from the Governor of Andhra Pradesh at the Nagarjuna University Convocation in 1988. He went on to acquire M.D.(Ay), Ph.D.(Ay), F.R.A.V., and a Diploma in Yoga."
                : "అతని విద్యా ప్రయాణం మొదటి నుండే శ్రేష్ఠతతో గుర్తించబడింది. అతను బి.ఎ.ఎం.ఎస్.లో గోల్డ్ మెడలిస్ట్‌గా పాస్ అయ్యాడు — 1988 నాగార్జున యూనివర్సిటీ కన్వొకేషన్‌లో ఆంధ్రప్రదేశ్ గవర్నర్ నుండి రెండు బంగారు పతకాలు స్వీకరించాడు."}
            </p>

            <h3 className="font-serif text-2xl text-foreground font-bold mt-10 mb-4">
              {lang === "en" ? "Professional Experience" : "వృత్తిపరమైన అనుభవం"}
            </h3>
            <ul className="space-y-3">
              <li><strong>{lang === "en" ? "Principal (Retd.)" : "ప్రిన్సిపాల్ (విశ్రాంత)"}</strong> — S.V. Ayurvedic College & Hospital, T.T. Devasthanams, Tirupati, AP</li>
              <li><strong>{lang === "en" ? "Consultant Ayurvedic Specialist" : "సలహా ఆయుర్వేద నిపుణుడు"}</strong> — Susruta Hospital, Tirupati</li>
              <li><strong>{lang === "en" ? "SBI Authorised Ayurvedic Doctor" : "ఎస్.బి.ఐ అధికృత ఆయుర్వేద డాక్టర్"}</strong></li>
              <li><strong>{lang === "en" ? "Governing Body Member" : "పాలక మండలి సభ్యుడు"}</strong> — CCRAS, New Delhi (2015–2018)</li>
              <li><strong>{lang === "en" ? "Key Note Speaker" : "ముఖ్య వక్త"}</strong> — {lang === "en" ? "First Australasian Conference on Panchakarma & Yoga, Adelaide, Australia (2013)" : "మొదటి ఆస్ట్రేలియన్ పంచకర్మ & యోగ సమావేశం, అడిలైడ్, ఆస్ట్రేలియా (2013)"}</li>
              <li>{lang === "en" ? "International academic visits to Australia, UK, Singapore, France and Switzerland (2016, 2018)" : "ఆస్ట్రేలియా, యూకే, సింగపూర్, ఫ్రాన్స్ మరియు స్విట్జర్లాండ్‌కు అంతర్జాతీయ విద్యా పర్యటనలు (2016, 2018)"}</li>
            </ul>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-10">
              {[
                { num: "30+", label: lang === "en" ? "Publications" : "ప్రచురణలు" },
                { num: "147+", label: lang === "en" ? "Guest Lectures" : "అతిథి ఉపన్యాసాలు" },
                { num: "25+", label: lang === "en" ? "Sessions Chaired" : "అధ్యక్షత వహించిన సమావేశాలు" },
                { num: "10+", label: lang === "en" ? "Major Awards" : "ప్రధాన అవార్డులు" },
              ].map((s) => (
                <div key={s.label} className="bg-[#f4faf4] border border-primary/20 p-5 rounded-2xl text-center">
                  <div className="text-3xl font-bold font-serif text-primary mb-1">{s.num}</div>
                  <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── ACHIEVEMENTS ───────────────────────────
function AchievementsSection({ lang }: { lang: string }) {
  const awards = [
    { year: "1985", title: lang === "en" ? "AP State Medal" : "ఏపీ రాష్ట్ర పతకం", desc: lang === "en" ? "For best scientific paper on 'Ayurvedic Approach to Skin Diseases', Vijayawada" : "విజయవాడలో 'చర్మ వ్యాధులకు ఆయుర్వేద విధానం'పై ఉత్తమ శాస్త్రీయ పత్రం కోసం" },
    { year: "1986", title: lang === "en" ? "Chavali Ramaiah Memorial Gold Medal" : "చావలి రమయ్య స్మారక బంగారు పతకం", desc: lang === "en" ? "Nagarjuna University — outstanding performance in final B.A.M.S." : "నాగార్జున విశ్వవిద్యాలయం — చివరి బి.ఎ.ఎం.ఎస్.లో అత్యుత్తమ ప్రదర్శన" },
    { year: "1986", title: lang === "en" ? "Achanta Lakshmipathi Memorial Gold Medal" : "అచంట లక్ష్మీపతి స్మారక బంగారు పతకం", desc: lang === "en" ? "Nagarjuna University — for outstanding performance across all five B.A.M.S. years" : "అన్ని ఐదు బి.ఎ.ఎం.ఎస్. సంవత్సరాల్లో అత్యుత్తమ ప్రదర్శన కోసం" },
    { year: "1992", title: lang === "en" ? "Baidyanath Foundation National Award" : "బైద్యనాథ్ ఫౌండేషన్ జాతీయ అవార్డు", desc: lang === "en" ? "For best scientific paper on 'Scientific basis of Ayurvedic Diagnostics' at Nagpur" : "నాగ్‌పూర్‌లో 'ఆయుర్వేద నిర్ధారణ యొక్క శాస్త్రీయ ఆధారం'పై ఉత్తమ పత్రానికి" },
    { year: "1997", title: lang === "en" ? "Doctor of Science Honour" : "డాక్టర్ ఆఫ్ సైన్స్ గౌరవం", desc: lang === "en" ? "Conferred by Open International University for Complementary Medicine, Colombo" : "కొలంబో, ఓపెన్ ఇంటర్నేషనల్ యూనివర్సిటీ ఫర్ కాంప్లిమెంటరీ మెడిసిన్ ద్వారా ప్రదానం" },
    { year: "2006", title: lang === "en" ? "Outstanding Young Person — JCI" : "అత్యుత్తమ యువ వ్యక్తి — జెసిఐ", desc: lang === "en" ? "JCI South East Zone — Coastal AP and Orissa" : "జెసిఐ సౌత్ ఈస్ట్ జోన్ — కోస్టల్ ఏపీ మరియు ఒరిస్సా" },
    { year: "2006", title: lang === "en" ? "Outstanding Young Indian — JCI National" : "అత్యుత్తమ యువ భారతీయుడు — జెసిఐ జాతీయ", desc: lang === "en" ? "Junior Chamber International India — National Award, Bangalore" : "జూనియర్ ఛాంబర్ ఇంటర్నేషనల్ ఇండియా — జాతీయ అవార్డు, బెంగళూరు" },
    { year: "2016", title: lang === "en" ? "Dhanvantari Award" : "ధన్వంతరి అవార్డు", desc: lang === "en" ? "Recognizing outstanding services in Ayurveda, Vijayawada" : "విజయవాడలో ఆయుర్వేదంలో అత్యుత్తమ సేవలను గుర్తించి" },
    { year: "2017", title: lang === "en" ? "International Charaka Award" : "అంతర్జాతీయ చరక అవార్డు", desc: lang === "en" ? "AAPNA, USA — for excellence in Ayurvedic teaching, Belagavi" : "ఎఎపిఎన్ఎ, యుఎస్ఎ — ఆయుర్వేద బోధనలో శ్రేష్ఠతకు, బళ్ళారి" },
    { year: "2023", title: lang === "en" ? "Ayurveda Sarvabhouma Award" : "ఆయుర్వేద సార్వభౌమ అవార్డు", desc: lang === "en" ? "National Sanskrit University, Tirupati" : "జాతీయ సంస్కృత విశ్వవిద్యాలయం, తిరుపతి" },
  ];

  return (
    <section id="achievements" className="py-24 bg-[#f4faf4]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "Awards & Recognitions" : "అవార్డులు & గుర్తింపులు"}
          title={lang === "en" ? "A Legacy of Excellence" : "శ్రేష్ఠత వారసత్వం"}
          subtitle={lang === "en" ? "Over four decades of distinguished service to Ayurveda, recognised nationally and internationally." : "నాలుగు దశాబ్దాలకు పైగా ఆయుర్వేదానికి ప్రసిద్ధ సేవ, జాతీయంగా మరియు అంతర్జాతీయంగా గుర్తింపు పొందింది."}
        />

        {/* Timeline */}
        <div className="mt-14 relative">
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-primary/40 to-transparent -translate-x-1/2 hidden md:block"></div>
          <div className="space-y-8">
            {awards.map((award, i) => (
              <div key={i} className={`flex flex-col md:flex-row items-start md:items-center gap-4 ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"}`}>
                {/* Card */}
                <div className="w-full md:w-[calc(50%-2rem)] bg-white p-6 rounded-2xl shadow-sm border border-border/60 hover:border-primary/30 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="font-serif font-bold text-base text-foreground leading-snug">{award.title}</h4>
                    <span className="shrink-0 px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">{award.year}</span>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{award.desc}</p>
                </div>
                {/* Center icon */}
                <div className="hidden md:flex w-10 h-10 rounded-full bg-primary text-white items-center justify-center shadow-lg shrink-0 z-10">
                  <Trophy size={16} />
                </div>
                <div className="hidden md:block w-[calc(50%-2rem)]"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Extra stats */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: "5", label: lang === "en" ? "CME Programs Organized" : "నిర్వహించిన CME కార్యక్రమాలు" },
            { num: "25+", label: lang === "en" ? "Scientific Sessions Chaired" : "అధ్యక్షత వహించిన సెషన్‌లు" },
            { num: "6", label: lang === "en" ? "Countries Visited" : "సందర్శించిన దేశాలు" },
            { num: "200+", label: lang === "en" ? "Health Lectures (SVETA)" : "ఆరోగ్య ఉపన్యాసాలు (SVETA)" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-primary/20 p-5 rounded-2xl text-center shadow-sm">
              <div className="text-3xl font-bold font-serif text-primary mb-1">{s.num}</div>
              <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── SERVICES ───────────────────────────
function ServicesSection({ lang }: { lang: string }) {
  const services = [
    {
      icon: <Activity size={30} />,
      title: lang === "en" ? "Ayurvedic Consultations" : "ఆయుర్వేద సంప్రదింపులు",
      desc: lang === "en"
        ? "Detailed personal consultation using Nadi Pariksha (Pulse diagnosis) and Prakriti analysis to determine the root cause of ailments."
        : "వ్యాధి యొక్క మూల కారణాన్ని నిర్ణయించడానికి నాడీ పరీక్ష (పల్స్ నిర్ధారణ) మరియు ప్రకృతి విశ్లేషణను ఉపయోగించి వివరణాత్మక వ్యక్తిగత సంప్రదింపు.",
    },
    {
      icon: <Droplets size={30} />,
      title: lang === "en" ? "Panchakarma Therapy" : "పంచకర్మ చికిత్స",
      desc: lang === "en"
        ? "Authentic detoxification and rejuvenation therapies including Vamana, Virechana, Basti, Nasya, and Raktamokshana performed with traditional precision."
        : "వమన, విరేచన, బస్తి, నస్య మరియు రక్తమోక్షణతో సహా సాంప్రదాయ ఖచ్చితత్వంతో ప్రామాణికమైన డిటాక్సిఫికేషన్ మరియు పునరుజ్జీవన చికిత్సలు.",
    },
    {
      icon: <Heart size={30} />,
      title: lang === "en" ? "Chronic Disease Management" : "దీర్ఘకాలిక వ్యాధి నిర్వహణ",
      desc: lang === "en"
        ? "Specialized Ayurvedic protocols for managing Arthritis, Diabetes, Skin disorders, Respiratory conditions, and Gastrointestinal problems."
        : "ఆర్థ్రైటిస్, మధుమేహం, చర్మ వ్యాధులు, శ్వాసకోశ పరిస్థితులు మరియు జీర్ణ సమస్యల నిర్వహణ కోసం ప్రత్యేక ఆయుర్వేద ప్రోటోకాల్‌లు.",
    },
    {
      icon: <Leaf size={30} />,
      title: lang === "en" ? "Wellness & Rejuvenation" : "ఆరోగ్యం & పునరుజ్జీవనం",
      desc: lang === "en"
        ? "Rasayana therapies to boost immunity, reduce stress, improve vitality, and promote healthy aging with natural herbal formulations."
        : "రోగనిరోధక శక్తిని పెంచడానికి, ఒత్తిడిని తగ్గించడానికి, శక్తిని మెరుగుపరచడానికి మరియు ఆరోగ్యకరమైన వృద్ధాప్యాన్ని ప్రోత్సహించడానికి రసాయన చికిత్సలు.",
    },
  ];

  return (
    <section id="services" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "Our Services" : "మా సేవలు"}
          title={lang === "en" ? "Holistic Ayurvedic Care" : "సమగ్ర ఆయుర్వేద సంరక్షణ"}
          subtitle={lang === "en" ? "Comprehensive treatments tailored to your unique mind-body constitution." : "మీ ప్రత్యేకమైన శరీర-మనస్సు నిర్మాణానికి అనుగుణంగా సమగ్ర చికిత్సలు."}
        />
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((s, i) => (
            <div key={i} className="group flex gap-6 p-8 bg-[#f8fcf8] border border-border/60 rounded-3xl hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <div className="h-14 w-14 flex-shrink-0 bg-primary/10 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                {s.icon}
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold mb-3 text-foreground">{s.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── APPOINTMENTS ───────────────────────────
function AppointmentsSection({ lang, t }: { lang: string; t: (k: any) => string }) {
  const { data: settings } = useGetSettings();
  const { data: openMonths = [], isLoading: loadingMonths } = useListOpenMonths();

  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [calendarDate, setCalendarDate] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });

  const { data: availability } = useGetAvailability({ month: selectedMonth }, { query: { enabled: !!selectedMonth } });
  const { data: slots = [], isLoading: loadingSlots } = useGetSlots({ date: selectedDate }, { query: { enabled: !!selectedDate } });
  const createMutation = useCreateAppointment();

  // Set calendar to show selected month
  const calendarMonth = useMemo(() => {
    if (!selectedMonth) return null;
    return parseISO(`${selectedMonth}-01`);
  }, [selectedMonth]);

  const availableDatesSet = useMemo(() => new Set(availability?.availableDates || []), [availability]);
  const blockedDatesSet = useMemo(() => new Set(availability?.blockedDates || []), [availability]);

  const calendarDays = useMemo(() => {
    if (!calendarMonth) return [];
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = getDay(startOfMonth(calendarMonth)); // 0=Sun
    const totalDays = getDaysInMonth(calendarMonth);
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= totalDays; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push(ds);
    }
    return days;
  }, [calendarMonth]);

  const today = new Date().toISOString().split("T")[0];

  const morningSlots = slots.filter(s => s.time.includes("AM") || s.time === "01:00 PM");
  const eveningSlots = slots.filter(s => {
    const h = parseInt(s.time.split(":")[0]);
    return s.time.includes("PM") && h >= 6;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedSlot || !formData.patientName || !formData.patientPhone) return;
    createMutation.mutate({
      data: { ...formData, date: selectedDate, timeSlot: selectedSlot }
    }, {
      onSuccess: () => setIsSuccess(true),
    });
  };

  if (settings && !settings.appointmentBookingEnabled) {
    return (
      <section id="appointments" className="py-24 bg-[#f4faf4]">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <Calendar size={48} className="mx-auto text-muted-foreground mb-4 opacity-40" />
          <h2 className="text-2xl font-serif font-bold mb-2">{lang === "en" ? "Online Booking Unavailable" : "ఆన్‌లైన్ బుకింగ్ అందుబాటులో లేదు"}</h2>
          <p className="text-muted-foreground">{lang === "en" ? "Please call us to schedule your appointment." : "అపాయింట్‌మెంట్ షెడ్యూల్ చేయడానికి దయచేసి మాకు కాల్ చేయండి."}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="appointments" className="py-24 bg-[#f4faf4]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "Book an Appointment" : "అపాయింట్‌మెంట్ బుక్ చేయండి"}
          title={lang === "en" ? "Schedule Your Consultation" : "మీ సంప్రదింపు షెడ్యూల్ చేయండి"}
          subtitle={lang === "en"
            ? "Select an available date and time to meet Dr. P. Murali Krishna."
            : "డాక్టర్ పి. మురళీకృష్ణను కలవడానికి అందుబాటులో ఉన్న తేదీ మరియు సమయాన్ని ఎంచుకోండి."}
        />

        <div className="mt-14">
          {isSuccess ? (
            <div className="max-w-lg mx-auto bg-white p-12 rounded-3xl shadow-md border border-primary/20 text-center">
              <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={44} />
              </div>
              <h3 className="text-2xl font-serif font-bold mb-3">{lang === "en" ? "Appointment Request Sent!" : "అపాయింట్‌మెంట్ అభ్యర్థన పంపబడింది!"}</h3>
              <p className="text-muted-foreground mb-2">
                {lang === "en"
                  ? `Your request for ${format(parseISO(selectedDate), "MMMM d, yyyy")} at ${selectedSlot} has been received.`
                  : `${format(parseISO(selectedDate), "d MMMM yyyy")} న ${selectedSlot} కి మీ అభ్యర్థన స్వీకరించబడింది.`}
              </p>
              <p className="text-sm text-muted-foreground mb-8">{lang === "en" ? "Our staff will call you to confirm." : "మా సిబ్బంది నిర్ధారించడానికి మీకు కాల్ చేస్తారు."}</p>
              <Button onClick={() => {
                setIsSuccess(false); setSelectedDate(""); setSelectedSlot(""); setSelectedMonth("");
                setFormData({ patientName: "", patientPhone: "", patientEmail: "", reason: "" });
              }}>{lang === "en" ? "Book Another" : "మరొకటి బుక్ చేయండి"}</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Step 1: Month + Calendar */}
              <div className="bg-white rounded-3xl shadow-sm border border-border/60 overflow-hidden mb-6">
                <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm font-bold">1</span>
                  <h3 className="font-serif font-bold text-lg">{lang === "en" ? "Select Date & Time" : "తేదీ & సమయం ఎంచుకోండి"}</h3>
                </div>

                <div className="p-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Month Selector */}
                    <div className="lg:w-56 flex-shrink-0">
                      <label className="block text-sm font-semibold mb-2 text-foreground/80">{t("form.month")}</label>
                      {loadingMonths ? (
                        <div className="h-12 bg-muted animate-pulse rounded-xl"></div>
                      ) : openMonths.length === 0 ? (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                          <Info size={16} className="inline mr-1.5" />
                          {lang === "en" ? "No months are open for booking yet." : "ఇంకా ఏ నెల బుకింగ్ కోసం తెరవబడలేదు."}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {openMonths.filter(m => m.isOpen).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { setSelectedMonth(m.month); setSelectedDate(""); setSelectedSlot(""); }}
                              className={`w-full px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all border ${
                                selectedMonth === m.month
                                  ? "bg-primary text-white border-primary shadow-md"
                                  : "bg-muted/50 border-border hover:border-primary hover:text-primary"
                              }`}
                            >
                              <Calendar size={14} className="inline mr-2 mb-0.5" />
                              {format(parseISO(`${m.month}-01`), "MMMM yyyy")}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Legend */}
                      {selectedMonth && (
                        <div className="mt-6 space-y-2 text-xs">
                          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-3">{lang === "en" ? "Legend" : "గుర్తు"}</p>
                          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-primary"></div><span>{lang === "en" ? "Available" : "అందుబాటు"}</span></div>
                          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-muted border border-border"></div><span>{lang === "en" ? "Unavailable / Past" : "అందుబాటు లేదు"}</span></div>
                          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-destructive/20 border border-destructive/30"></div><span>{lang === "en" ? "Blocked" : "బ్లాక్ చేయబడింది"}</span></div>
                          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm bg-primary/20 ring-2 ring-primary"></div><span>{lang === "en" ? "Selected" : "ఎంచుకున్నది"}</span></div>
                        </div>
                      )}
                    </div>

                    {/* Calendar Grid */}
                    {selectedMonth && calendarMonth && (
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-serif font-bold text-lg text-primary">
                            {format(calendarMonth, "MMMM yyyy")}
                          </h4>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Info size={12} />
                            {lang === "en" ? "Sundays: Morning only" : "ఆదివారాలు: ఉదయం మాత్రమే"}
                          </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                            <div key={d} className="text-center text-xs font-bold text-muted-foreground py-1">
                              {d}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {calendarDays.map((day, idx) => {
                            if (!day) return <div key={idx} />;
                            const isAvailable = availableDatesSet.has(day);
                            const isBlocked = blockedDatesSet.has(day);
                            const isPast = day < today;
                            const isSunday = new Date(day).getDay() === 0;
                            const isSelected = selectedDate === day;

                            let cls = "relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-semibold transition-all ";
                            if (isSelected) cls += "bg-primary text-white ring-2 ring-primary ring-offset-1 shadow-md";
                            else if (isBlocked) cls += "bg-red-50 text-red-300 border border-red-100 cursor-not-allowed";
                            else if (isPast) cls += "bg-muted/40 text-muted-foreground/40 cursor-not-allowed";
                            else if (isAvailable) cls += "bg-primary/10 text-primary hover:bg-primary hover:text-white cursor-pointer hover:shadow-md";
                            else cls += "bg-muted/30 text-muted-foreground/50 cursor-not-allowed";

                            const dayNum = day.split("-")[2];
                            return (
                              <button
                                key={day}
                                type="button"
                                disabled={!isAvailable || isPast}
                                onClick={() => { setSelectedDate(day); setSelectedSlot(""); }}
                                className={cls}
                                title={isBlocked ? "Doctor unavailable" : isSunday ? "Morning slots only" : ""}
                              >
                                {dayNum}
                                {isSunday && isAvailable && !isSelected && (
                                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/60"></span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Time Slots */}
                  {selectedDate && (
                    <div className="mt-8 pt-6 border-t border-border/60">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock size={16} className="text-primary" />
                        <h4 className="font-semibold text-foreground">
                          {lang === "en"
                            ? `Available slots for ${format(parseISO(selectedDate), "EEEE, MMMM d")}`
                            : `${format(parseISO(selectedDate), "EEEE, d MMMM")} కి అందుబాటులో ఉన్న స్లాట్‌లు`}
                          {new Date(selectedDate).getDay() === 0 && (
                            <span className="ml-2 text-xs text-amber-600 font-normal">(Morning only — Sunday)</span>
                          )}
                        </h4>
                      </div>

                      {loadingSlots ? (
                        <div className="flex gap-2 flex-wrap">
                          {[...Array(8)].map((_, i) => <div key={i} className="h-10 w-24 bg-muted animate-pulse rounded-lg"></div>)}
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Morning */}
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                              🌅 {lang === "en" ? "Morning — 10:00 AM to 1:00 PM" : "ఉదయం — 10:00 AM నుండి 1:00 PM వరకు"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {morningSlots.map((slot) => (
                                <SlotButton key={slot.time} slot={slot} selected={selectedSlot === slot.time} onClick={() => setSelectedSlot(slot.time)} />
                              ))}
                            </div>
                          </div>

                          {/* Evening — only if not Sunday */}
                          {eveningSlots.length > 0 && (
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                                🌙 {lang === "en" ? "Evening — 6:00 PM to 10:00 PM" : "సాయంత్రం — 6:00 PM నుండి 10:00 PM వరకు"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {eveningSlots.map((slot) => (
                                  <SlotButton key={slot.time} slot={slot} selected={selectedSlot === slot.time} onClick={() => setSelectedSlot(slot.time)} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Patient Details */}
              <div className={`bg-white rounded-3xl shadow-sm border transition-all duration-300 ${selectedSlot ? "border-border/60 opacity-100" : "border-border/30 opacity-50 pointer-events-none"}`}>
                <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm font-bold">2</span>
                  <h3 className="font-serif font-bold text-lg">{lang === "en" ? "Your Details" : "మీ వివరాలు"}</h3>
                  {selectedSlot && (
                    <span className="ml-auto text-sm text-primary font-semibold">
                      {format(parseISO(selectedDate), "MMM d")} · {selectedSlot}
                    </span>
                  )}
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.name")} *</label>
                    <input required type="text" value={formData.patientName}
                      onChange={e => setFormData({ ...formData, patientName: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">{t("form.phone")} *</label>
                    <input required type="tel" value={formData.patientPhone}
                      onChange={e => setFormData({ ...formData, patientPhone: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-2">{t("form.email")}</label>
                    <input type="email" value={formData.patientEmail}
                      onChange={e => setFormData({ ...formData, patientEmail: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold mb-2">{t("form.reason")}</label>
                    <textarea rows={3} value={formData.reason}
                      onChange={e => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full p-3 rounded-xl border border-border bg-white focus:ring-2 focus:ring-primary focus:outline-none resize-none" />
                  </div>
                  <div className="sm:col-span-2 pt-2">
                    <Button type="submit" size="lg" className="w-full text-base"
                      disabled={!selectedSlot || !formData.patientName || !formData.patientPhone || createMutation.isPending}>
                      {createMutation.isPending ? t("loading") : (lang === "en" ? "Confirm Appointment Request" : "అపాయింట్‌మెంట్ అభ్యర్థన నిర్ధారించండి")}
                    </Button>
                    {createMutation.isError && (
                      <p className="text-destructive text-sm text-center mt-2 font-medium">
                        {lang === "en" ? "Failed to submit. Please try again or call us." : "సమర్పించడం విఫలమైంది. దయచేసి మళ్ళీ ప్రయత్నించండి."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function SlotButton({ slot, selected, onClick }: { slot: { time: string; available: boolean }; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!slot.available}
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
        selected
          ? "bg-primary text-white border-primary shadow-md"
          : slot.available
          ? "bg-white border-border hover:border-primary hover:text-primary hover:shadow-sm"
          : "bg-muted/50 text-muted-foreground/40 border-border/30 cursor-not-allowed"
      }`}
    >
      {slot.time}
    </button>
  );
}

// ─────────────────────────── TESTIMONIALS ───────────────────────────
function TestimonialsSection({ lang }: { lang: string }) {
  const { data: settings } = useGetSettings();
  const { data: testimonials = [], isLoading } = useListTestimonials();

  if (settings && !settings.testimonialsEnabled) return null;

  return (
    <section id="testimonials" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "Patient Experiences" : "రోగుల అనుభవాలు"}
          title={lang === "en" ? "What Our Patients Say" : "మా రోగులు ఏమంటున్నారు"}
          subtitle={lang === "en" ? "Real experiences from patients who have found healing at Susruta Hospital." : "సుశ్రుత హాస్పిటల్‌లో వైద్యం పొందిన రోగుల నిజమైన అనుభవాలు."}
        />
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading
            ? [1, 2, 3].map((i) => <div key={i} className="h-64 bg-muted animate-pulse rounded-3xl"></div>)
            : testimonials.map((tm) => (
                <div key={tm.id} className="relative bg-[#f8fcf8] border border-border/60 p-8 rounded-3xl hover:border-primary/30 hover:shadow-md transition-all">
                  <Quote size={36} className="absolute top-5 right-5 text-primary/10" />
                  <div className="flex gap-1 mb-5 text-yellow-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={16} fill={i < tm.rating ? "currentColor" : "none"} strokeWidth={i < tm.rating ? 0 : 2} />
                    ))}
                  </div>
                  <p className="text-foreground/80 leading-relaxed italic mb-6">
                    "{lang === "te" && tm.contentTe ? tm.contentTe : tm.content}"
                  </p>
                  <div className="border-t border-border/50 pt-4">
                    <p className="font-bold font-serif text-foreground">{tm.patientName}</p>
                    {tm.patientLocation && <p className="text-sm text-muted-foreground">{tm.patientLocation}</p>}
                  </div>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── CONTACT ───────────────────────────
function ContactSection({ lang, t }: { lang: string; t: (k: any) => string }) {
  const { data: settings } = useGetSettings();

  return (
    <section id="contact" className="py-24 bg-[#f4faf4]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          label={lang === "en" ? "Contact Us" : "సంప్రదించండి"}
          title={lang === "en" ? "Get in Touch" : "మాతో సంప్రదించండి"}
          subtitle={lang === "en"
            ? "We are here to help you. Reach us during working hours."
            : "మేము మీకు సహాయం చేయడానికి ఇక్కడ ఉన్నాము. పని గంటల్లో మమ్మల్ని సంప్రదించండి."}
        />
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                icon: <MapPin size={20} />,
                title: lang === "en" ? "Address" : "చిరునామా",
                value: settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507",
              },
              {
                icon: <Phone size={20} />,
                title: lang === "en" ? "Phone" : "ఫోన్",
                value: [settings?.clinicPhone1, settings?.clinicPhone2].filter(Boolean).join("\n") || "9492068180",
              },
              {
                icon: <Clock size={20} />,
                title: lang === "en" ? "Working Hours" : "పని గంటలు",
                value: settings?.workingHours || "Mon-Sat: 10:00 AM – 1:00 PM, 6:00 PM – 10:00 PM\nSunday: 10:00 AM – 1:00 PM",
              },
              {
                icon: <Mail size={20} />,
                title: lang === "en" ? "Email" : "ఈమెయిల్",
                value: settings?.clinicEmail || (lang === "en" ? "Not provided" : "అందించబడలేదు"),
              },
            ].map((item) => (
              <div key={item.title} className="bg-white p-6 rounded-2xl border border-border/60 shadow-sm flex flex-col gap-3">
                <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-foreground mb-1">{item.title}</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Map placeholder */}
          <div className="bg-white rounded-3xl overflow-hidden min-h-[320px] border border-border/60 shadow-sm relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-[#f8fcf8]">
              <MapPin size={52} className="mb-4 text-primary/30" />
              <p className="font-serif font-bold text-xl text-foreground/60">Susruta Hospital</p>
              <p className="text-sm text-muted-foreground mt-1">119, Ramulavari North Mada Street</p>
              <p className="text-sm text-muted-foreground">Tirupati, Andhra Pradesh - 517 507</p>
              <a
                href="https://maps.google.com/?q=119+Ramulavari+North+Mada+Street+Tirupati"
                target="_blank" rel="noopener noreferrer"
                className="mt-5 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {lang === "en" ? "Open in Google Maps" : "గూగుల్ మ్యాప్స్‌లో తెరవండి"}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── SHARED ───────────────────────────
function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-xs uppercase tracking-wider mb-4">
        <Leaf size={13} /> {label}
      </div>
      <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-4">{title}</h2>
      {subtitle && <p className="text-muted-foreground text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}
