import React from "react";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
import { Award, Leaf, ShieldCheck, Clock } from "lucide-react";
import drPhoto from "@assets/Dr_Murali_Krishna_1773837837953.jpeg";

export default function Home() {
  const { lang } = useLanguage();
  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute inset-0 -z-10">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Background" 
            className="w-full h-full object-cover opacity-60 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            
            <div className="flex-1 space-y-8 text-center lg:text-left z-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-primary font-medium text-sm mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <Leaf size={16} />
                <span>{lang === 'en' ? "Authentic Ayurvedic Healing" : "ప్రామాణికమైన ఆయుర్వేద వైద్యం"}</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-foreground leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
                {lang === 'en' ? (
                  <>Experience <span className="text-primary">Nature's</span> Touch for Your Health</>
                ) : (
                  <>మీ ఆరోగ్యం కోసం <span className="text-primary">ప్రకృతి</span> స్పర్శను అనుభవించండి</>
                )}
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                {lang === 'en' 
                  ? "Led by Dr. P. Murali Krishna, highly decorated Ayurvedic specialist bringing decades of authentic healing experience to Tirupati."
                  : "తిరుపతిలో దశాబ్దాల ప్రామాణికమైన వైద్య అనుభవాన్ని అందిస్తున్న అత్యంత అలంకరించబడిన ఆయుర్వేద నిపుణుడు డాక్టర్ పి. మురళీకృష్ణ నేతృత్వంలో."}
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start animate-in fade-in slide-in-from-bottom-10 duration-700 delay-300">
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <Link href="/appointments">{t("btn.book")}</Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="w-full sm:w-auto bg-white/50 backdrop-blur-sm">
                  <Link href="/about">{t("btn.read_more")}</Link>
                </Button>
              </div>
            </div>

            <div className="flex-1 w-full max-w-md lg:max-w-none relative animate-in fade-in zoom-in-95 duration-1000 delay-200">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-accent/20 rounded-[3rem] transform rotate-3 scale-105 -z-10 blur-xl"></div>
              <div className="relative rounded-[2.5rem] overflow-hidden border-8 border-white shadow-2xl">
                <img 
                  src={drPhoto} 
                  alt="Dr. P. Murali Krishna" 
                  className="w-full h-auto object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white">
                  <h3 className="font-serif font-bold text-2xl">{t("doctor.name")}</h3>
                  <p className="text-white/80 font-medium">B.A.M.S., M.D.(Ay), Ph.D.(Ay)</p>
                </div>
              </div>
              
              {/* Floating Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-border flex items-center gap-4">
                <div className="bg-accent/10 p-3 rounded-xl text-accent">
                  <Award size={24} />
                </div>
                <div>
                  <p className="font-bold text-foreground">Gold Medalist</p>
                  <p className="text-xs text-muted-foreground">Multiple Awards</p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-8 rounded-3xl text-center flex flex-col items-center">
              <div className="h-16 w-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-xl font-serif font-bold mb-3">Expert Doctor</h3>
              <p className="text-muted-foreground">Retired Principal & highly qualified specialist with over 3 decades of experience.</p>
            </div>
            
            <div className="glass-card p-8 rounded-3xl text-center flex flex-col items-center border-primary/20 shadow-md transform md:-translate-y-4">
              <div className="h-16 w-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/30">
                <Leaf size={32} />
              </div>
              <h3 className="text-xl font-serif font-bold mb-3">Authentic Ayurveda</h3>
              <p className="text-muted-foreground">Traditional Panchakarma and genuine herbal treatments for chronic ailments.</p>
            </div>
            
            <div className="glass-card p-8 rounded-3xl text-center flex flex-col items-center">
              <div className="h-16 w-16 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-6">
                <Clock size={32} />
              </div>
              <h3 className="text-xl font-serif font-bold mb-3">Easy Booking</h3>
              <p className="text-muted-foreground">Check real-time availability and book your appointment online instantly.</p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
