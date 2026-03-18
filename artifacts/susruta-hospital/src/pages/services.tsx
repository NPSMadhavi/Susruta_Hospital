import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { Leaf, Activity, Heart, Droplets } from "lucide-react";

export default function Services() {
  const { lang } = useLanguage();

  const services = [
    {
      title: "Ayurvedic Consultations",
      icon: <Activity size={32} />,
      desc: "Detailed personal consultation focusing on Nadi Pariksha (Pulse diagnosis) and Prakriti analysis to determine the root cause of ailments."
    },
    {
      title: "Panchakarma Therapy",
      icon: <Droplets size={32} />,
      desc: "Authentic detoxification and rejuvenation therapies including Vamana, Virechana, Basti, Nasya, and Raktamokshana."
    },
    {
      title: "Chronic Disease Management",
      icon: <Heart size={32} />,
      desc: "Specialized Ayurvedic protocols for managing Arthritis, Diabetes, Skin disorders, Respiratory issues, and Gastrointestinal problems."
    },
    {
      title: "Wellness & Rejuvenation",
      icon: <Leaf size={32} />,
      desc: "Rasayana therapies to boost immunity, reduce stress, improve vitality, and promote healthy aging."
    }
  ];

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {lang === 'en' ? "Our Services" : "మా సేవలు"}
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Comprehensive Ayurvedic treatments tailored to your unique mind-body constitution.
          </p>
        </div>
      </div>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {services.map((service, idx) => (
              <div key={idx} className="glass-card p-8 rounded-3xl group hover:-translate-y-1 transition-all duration-300">
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  {service.icon}
                </div>
                <h3 className="text-2xl font-serif font-bold mb-4 text-foreground">{service.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-lg">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
