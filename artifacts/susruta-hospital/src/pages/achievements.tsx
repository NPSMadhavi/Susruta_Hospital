import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Trophy, Star, Globe } from "lucide-react";

const awards = [
  {
    year: "1985",
    icon: Trophy,
    title: "AP State Medal",
    desc: "Conferred by the Government of Andhra Pradesh for presenting the finest scientific paper on 'Ayurvedic Approach to Skin Diseases' at a state-level academic competition in Vijayawada.",
  },
  {
    year: "1986",
    icon: Trophy,
    title: "Chavali Ramaiah Memorial Gold Medal",
    desc: "Awarded by Nagarjuna University in recognition of outstanding academic performance in the final year B.A.M.S. examination — presented at the University Convocation by the Governor of Andhra Pradesh.",
  },
  {
    year: "1986",
    icon: Trophy,
    title: "Achanta Lakshmipathi Memorial Gold Medal",
    desc: "Awarded by Nagarjuna University for exceptional academic merit sustained across all five years of the B.A.M.S. programme — presented at the University Convocation by the Governor of Andhra Pradesh.",
  },
  {
    year: "1992",
    icon: Star,
    title: "Baidyanath Foundation National Award",
    desc: "A prestigious national recognition conferred at the All India Post Graduate level scientific paper competition in Nagpur for the paper 'Scientific Basis of Ayurvedic Diagnostics' — awarded by the Vaidya Ram Narayana Sharma Memorial Baidyanath Foundation.",
  },
  {
    year: "1997",
    icon: Star,
    title: "Doctor of Science — Honoris Causa",
    desc: "An honorary Doctorate of Science conferred by the Open International University for Complementary Medicine, Colombo, in recognition of his distinguished contributions to Ayurvedic medicine and research.",
  },
  {
    year: "2006",
    icon: Star,
    title: "Outstanding Young Person — JCI South East Zone",
    desc: "Honoured by Junior Chamber International (JCI) South East Zone, encompassing Coastal Andhra Pradesh and Orissa, in recognition of his exemplary professional achievements and community contributions.",
  },
  {
    year: "2006",
    icon: Star,
    title: "Outstanding Young Indian — JCI National Award",
    desc: "A national award presented by Junior Chamber International India in Bangalore, recognising him as one of India's outstanding young professionals for his contributions to Ayurvedic education and public health.",
  },
  {
    year: "2013",
    icon: Globe,
    title: "Keynote Speaker — First Australasian Conference on Panchakarma & Yoga",
    desc: "Invited as the Keynote Speaker at the inaugural Australasian Conference on Panchakarma & Yoga held in Adelaide, Australia — representing India's classical Ayurvedic tradition on an international platform.",
  },
  {
    year: "2016",
    icon: Trophy,
    title: "Dhanvantari Award",
    desc: "Awarded in Vijayawada for outstanding and sustained service to the field of Ayurveda — one of the most respected distinctions in the Ayurvedic medical community.",
  },
  {
    year: "2017",
    icon: Globe,
    title: "International Charaka Award",
    desc: "Conferred by the Association of Ayurvedic Professionals of North America (AAPNA), USA, at Belagavi, in recognition of excellence in Ayurvedic teaching, scholarship, and clinical practice.",
  },
  {
    year: "2023",
    icon: Trophy,
    title: "Ayurveda Sarvabhouma Award",
    desc: "Presented by the National Sanskrit University, Tirupati — one of the most distinguished honours in the Ayurvedic academic world — recognising a lifetime of exemplary contributions to Ayurvedic scholarship and practice.",
  },
];

export default function Achievements() {
  return (
    <PublicLayout>

      {/* ── Page Header ── */}
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-2">Honours & Recognition</p>
          <h1 className="text-4xl font-serif font-bold text-foreground">Awards & Achievements</h1>
          <p className="mt-3 text-muted-foreground text-lg max-w-2xl">
            A distinguished career spanning four decades, marked by consistent recognition from
            leading academic, national, and international institutions in Ayurvedic medicine.
          </p>
        </div>
      </div>

      {/* ── Timeline ── */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:via-primary/20 before:to-transparent">

            {awards.map((award, index) => {
              const Icon = award.icon;
              return (
                <div
                  key={index}
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                >
                  {/* Icon */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
                    <Icon size={15} />
                  </div>

                  {/* Card */}
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] bg-white border border-border/60 p-6 rounded-2xl shadow-sm hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-serif font-bold text-lg text-foreground leading-snug">{award.title}</h3>
                      <span className="shrink-0 px-2.5 py-1 bg-primary/10 text-primary text-sm font-bold rounded-full">{award.year}</span>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{award.desc}</p>
                  </div>
                </div>
              );
            })}

          </div>

        </div>
      </section>
    </PublicLayout>
  );
}
