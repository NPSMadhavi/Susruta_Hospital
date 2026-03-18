import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { Award, Trophy, Star } from "lucide-react";

export default function Achievements() {
  const { lang } = useLanguage();

  const awards = [
    { year: "1985", title: "AP State Medal", desc: "For best scientific paper on Ayurvedic Approach to Skin Diseases" },
    { year: "1986", title: "Chavali Ramaiah Memorial Gold Medal", desc: "Nagarjuna University" },
    { year: "1986", title: "Achanta Lakshmipathi Memorial Gold Medal", desc: "For all 5 years B.A.M.S." },
    { year: "1992", title: "Baidyanath Foundation National Award", desc: "For best scientific paper" },
    { year: "1997", title: "Doctor of Science honour", desc: "Open International University, Colombo" },
    { year: "2006", title: "Outstanding Young Person", desc: "JCI South East Zone" },
    { year: "2006", title: "Outstanding Young Indian", desc: "Junior Chamber International India" },
    { year: "2016", title: "Dhanvantari Award", desc: "For outstanding services in Ayurveda" },
    { year: "2017", title: "International Charaka Award", desc: "From AAPNA, USA" },
    { year: "2023", title: "Ayurveda Sarvabhouma Award", desc: "National Sanskrit University, Tirupati" }
  ];

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {lang === 'en' ? "Awards & Achievements" : "అవార్డులు & విజయాలు"}
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl">
            A lifetime dedicated to the mastery and advancement of Ayurvedic Medicine, recognized globally.
          </p>
        </div>
      </div>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/50 before:via-primary/20 before:to-transparent">
            
            {awards.map((award, index) => (
              <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-primary text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
                  <Trophy size={16} />
                </div>
                
                {/* Content */}
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] glass-card p-6 rounded-2xl hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold font-serif text-lg text-foreground">{award.title}</h3>
                    <span className="px-3 py-1 bg-accent/10 text-accent font-bold text-sm rounded-full">{award.year}</span>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed">{award.desc}</p>
                </div>
              </div>
            ))}

          </div>

        </div>
      </section>
    </PublicLayout>
  );
}
