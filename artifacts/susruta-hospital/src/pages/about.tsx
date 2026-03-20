import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import drPhoto from "@assets/Dr_Murali_Krishna_1773837837953.jpeg";
import { BookOpen, FlaskConical, Users, Award } from "lucide-react";

export default function About() {
  return (
    <PublicLayout>

      {/* ── Page Header ── */}
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-2">Practitioner Profile</p>
          <h1 className="text-4xl font-serif font-bold text-foreground">About the Doctor</h1>
          <p className="mt-3 text-muted-foreground text-lg max-w-2xl">
            A distinguished physician, educator, and researcher who has dedicated over three decades
            to the advancement of classical Ayurvedic medicine.
          </p>
        </div>
      </div>

      {/* ── Main Content ── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row gap-14">

          {/* ── Sidebar ── */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="sticky top-28 space-y-5">
              <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-white ring-1 ring-border">
                <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto" />
              </div>
              <div className="bg-white border border-primary/20 p-6 rounded-2xl shadow-sm">
                <h3 className="font-serif font-bold text-xl text-primary leading-tight">
                  Dr. P. Murali Krishna
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground font-medium leading-relaxed">
                  B.A.M.S. (Gold Medalist) · M.D. (Ay) · Ph.D. (Ay) · F.R.A.V. · D.Yoga
                </p>
                <div className="mt-4 pt-4 border-t border-primary/10 space-y-2 text-sm">
                  <p className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Current Position</p>
                  <p className="font-semibold text-foreground">Consultant Ayurvedic Specialist</p>
                  <p className="text-muted-foreground">Susruta Hospital, Tirupati</p>
                </div>
                <div className="mt-4 pt-4 border-t border-primary/10 space-y-2 text-sm">
                  <p className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Former Position</p>
                  <p className="font-semibold text-foreground">Principal & Professor of Panchakarma</p>
                  <p className="text-muted-foreground">S.V. Ayurvedic College, T.T. Devasthanams, Tirupati</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 space-y-14">

            {/* Intro */}
            <div>
              <h2 className="font-serif text-3xl text-foreground font-bold mb-5">Brief Profile</h2>
              <p className="text-lg leading-relaxed text-foreground/80 mb-4">
                Dr. P. Murali Krishna is a highly distinguished Ayurvedic physician, teacher, and researcher
                with over 30 years of dedicated service in Ayurvedic education, clinical practice, and
                research. He is widely respected for his scholarly expertise in Panchakarma and classical
                Ayurvedic internal medicine.
              </p>
              <p className="text-base leading-relaxed text-foreground/70">
                Having served as Professor, Head of the Department of Panchakarma, and later as Principal
                of Sri Venkateswara Ayurvedic College — one of India's foremost institutions for Ayurvedic
                education under Tirumala Tirupati Devasthanams (TTD) — Dr. Krishna has made enduring
                contributions to strengthening postgraduate education, clinical training, and structured
                research in Ayurveda. Throughout his tenure, he mentored numerous postgraduate scholars and
                contributed to the development of systematic Panchakarma methodologies that continue to
                inform Ayurvedic practice and academic study.
              </p>
            </div>

            {/* Academic Brilliance */}
            <div>
              <h3 className="font-serif text-2xl text-foreground font-bold mb-4">Academic Distinction</h3>
              <p className="text-foreground/70 leading-relaxed">
                Dr. Krishna's academic journey reflects a lifelong commitment to excellence. He completed his
                B.A.M.S. as a Gold Medalist, receiving two prestigious gold medals from the Governor of
                Andhra Pradesh at the Nagarjuna University Convocation in 1988. He subsequently earned his
                M.D. in Panchakarma and a Ph.D. in Ayurveda from Banaras Hindu University (BHU), Varanasi —
                one of the most esteemed centres of Ayurvedic scholarship in India — along with a Diploma
                in Yoga and the distinguished Fellowship of Rashtriya Ayurveda Vidyapeeth (F.R.A.V.).
              </p>
            </div>

            {/* Fellowship highlight */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex gap-5 items-start">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Award size={22} />
              </div>
              <div>
                <p className="font-serif font-bold text-lg text-foreground mb-1">
                  Fellow — Rashtriya Ayurveda Vidyapeeth, New Delhi
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Dr. Krishna has been honoured with the Fellowship of Rashtriya Ayurveda Vidyapeeth (F.R.A.V.)
                  — a national distinction conferred by India's apex body for Ayurvedic scholarship —
                  in recognition of his outstanding contributions to Ayurvedic education and practice
                  at the national level.
                </p>
              </div>
            </div>

            {/* Areas of Specialisation */}
            <div>
              <h3 className="font-serif text-2xl text-foreground font-bold mb-6">Areas of Specialisation</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    title: "Panchakarma Therapy",
                    desc: "Classical Ayurvedic bio-purification and rejuvenation therapies, practised and taught with rigorous adherence to traditional texts."
                  },
                  {
                    title: "Classical Internal Medicine",
                    desc: "Ayurvedic approaches to the management of long-term and complex health conditions through time-honoured clinical protocols."
                  },
                  {
                    title: "Preventive Health & Rejuvenation",
                    desc: "Rasayana (rejuvenation) and preventive traditions described in Ayurvedic literature, applied to contemporary lifestyle contexts."
                  },
                  {
                    title: "Psychosomatic Wellness",
                    desc: "Integrating Ayurvedic principles with Yoga Nidra and mind-body practices for the management of stress and psychosomatic conditions."
                  },
                  {
                    title: "Rheumatological & Neurological Conditions",
                    desc: "Evidence-informed Panchakarma protocols for musculoskeletal, neurological, and neuromuscular disorders."
                  },
                  {
                    title: "Lifestyle & Chronic Conditions",
                    desc: "Structured Ayurvedic guidance on daily regimen, seasonal routines, and long-term wellbeing practices."
                  },
                ].map((item, i) => (
                  <div key={i} className="bg-white border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-sm transition-all duration-200">
                    <h4 className="font-semibold font-serif text-base text-foreground mb-2">{item.title}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scholarly Contributions */}
            <div>
              <h3 className="font-serif text-2xl text-foreground font-bold mb-6">Scholarly Contributions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { num: "30+", label: "Publications" },
                  { num: "147+", label: "Guest Lectures" },
                  { num: "25+", label: "Sessions Chaired" },
                  { num: "10+", label: "Major Awards" },
                ].map((s, i) => (
                  <div key={i} className="bg-[#f7f7f7] border border-primary/20 p-5 rounded-2xl text-center">
                    <div className="text-3xl font-bold font-serif text-primary mb-1">{s.num}</div>
                    <div className="text-sm font-semibold text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-foreground/70 leading-relaxed">
                Over the course of his career, Dr. Krishna has delivered more than 147 Guest Lectures as a
                Resource Person at national and international seminars, chaired 25+ scientific sessions, and
                contributed to collaborative clinical research in partnership with institutions such as the
                Sri Venkateswara Institute of Medical Sciences (SVIMS), Tirupati, and the National Academy
                of Ayurveda, New Delhi.
              </p>
            </div>

            {/* Professional Roles */}
            <div>
              <h3 className="font-serif text-2xl text-foreground font-bold mb-5">Professional Roles & Recognition</h3>
              <ul className="space-y-3">
                {[
                  "Principal (Retd.) — Sri Venkateswara Ayurvedic College & Hospital, T.T. Devasthanams, Tirupati",
                  "Professor & Head, PG Department of Panchakarma — S.V. Ayurvedic College, Tirupati",
                  "Governing Body Member — Central Council for Research in Ayurvedic Sciences (CCRAS), New Delhi (2015–2018)",
                  "Keynote Speaker — First Australasian Conference on Panchakarma & Yoga, Adelaide, Australia (2013)",
                  "Authorised Ayurvedic Doctor — State Bank of India (SBI)",
                  "Resource Person — National Academy of Ayurveda Panchakarma Workshops, New Delhi",
                  "Consultant Ayurvedic Specialist — Susruta Hospital, Tirupati",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-foreground/75 text-sm leading-relaxed">
                    <span className="text-primary mt-1 text-xs font-bold flex-shrink-0">✦</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Professional Memberships */}
            <div className="bg-[#f7f7f7] border border-border rounded-2xl p-7">
              <div className="flex items-center gap-3 mb-5">
                <Users size={20} className="text-primary" />
                <h3 className="font-serif text-xl text-foreground font-bold">Professional Memberships</h3>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground/70">
                {[
                  "All India Ayurvedic Congress, New Delhi",
                  "Indian Association for the Study of Traditional Asian Medicine (IASTAM), Mumbai",
                  "Association of Gerontology (India), Varanasi",
                  "Indian Medical Practitioners Co-Operative Pharmacy and Stores Ltd (IMPCOPS), Chennai",
                  "Indian Epilepsy Association, Tirupati",
                  "Sri Ramakrishna Seva Samithi, Tirupati",
                ].map((m, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-1 text-xs flex-shrink-0">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
