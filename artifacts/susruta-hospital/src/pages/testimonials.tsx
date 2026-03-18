import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { useListTestimonials, useGetSettings } from "@workspace/api-client-react";
import { Star, Quote } from "lucide-react";
import { Redirect } from "wouter";

export default function Testimonials() {
  const { lang } = useLanguage();
  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const { data: testimonials = [], isLoading } = useListTestimonials();

  if (settingsLoading) return <PublicLayout><div className="flex-1 flex items-center justify-center">Loading...</div></PublicLayout>;
  
  if (settings && !settings.testimonialsEnabled) {
    return <Redirect to="/" />;
  }

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {lang === 'en' ? "Patient Experiences" : "రోగుల అనుభవాలు"}
          </h1>
        </div>
      </div>

      <section className="py-16 bg-white flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1,2,3].map(i => <div key={i} className="h-64 bg-muted animate-pulse rounded-3xl"></div>)}
            </div>
          ) : testimonials.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              No testimonials available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((t) => (
                <div key={t.id} className="glass-card p-8 rounded-3xl relative">
                  <Quote size={40} className="absolute top-6 right-6 text-primary/10" />
                  
                  <div className="flex gap-1 mb-6 text-accent">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={18} fill={i < t.rating ? "currentColor" : "none"} strokeWidth={i < t.rating ? 0 : 2} />
                    ))}
                  </div>
                  
                  <p className="text-foreground/80 leading-relaxed mb-8 italic">
                    "{lang === 'te' && t.contentTe ? t.contentTe : t.content}"
                  </p>
                  
                  <div className="border-t border-border/50 pt-4 mt-auto">
                    <p className="font-bold font-serif text-foreground">{t.patientName}</p>
                    {t.patientLocation && <p className="text-sm text-muted-foreground">{t.patientLocation}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </section>
    </PublicLayout>
  );
}
