import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import { translations } from "@/lib/i18n";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";

export default function Contact() {
  const { lang } = useLanguage();
  const t = (key: keyof typeof translations) => translations[key]?.[lang] || key;
  const { data: settings, isLoading } = useGetSettings();

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {t("nav.contact")}
          </h1>
        </div>
      </div>

      <section className="py-20 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            <div className="space-y-8">
              <h2 className="text-3xl font-serif font-bold">Get in Touch</h2>
              <p className="text-muted-foreground text-lg">
                We are here to help you on your journey to holistic health. Please contact us during working hours.
              </p>

              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-20 bg-muted rounded-xl"></div>
                  <div className="h-20 bg-muted rounded-xl"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Address</h4>
                      <p className="text-sm text-muted-foreground">{settings?.clinicAddress || "119, Ramulavari North Mada Street, Tirupati - 517 507"}</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                      <Phone size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Phone</h4>
                      <p className="text-sm text-muted-foreground">{settings?.clinicPhone1}</p>
                      {settings?.clinicPhone2 && <p className="text-sm text-muted-foreground">{settings.clinicPhone2}</p>}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Working Hours</h4>
                      <p className="text-sm text-muted-foreground">{settings?.workingHours || "Contact for timings"}</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                      <Mail size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1">Email</h4>
                      <p className="text-sm text-muted-foreground">{settings?.clinicEmail || "Not provided"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-muted rounded-3xl overflow-hidden min-h-[400px] border border-border relative">
              {/* Maps Placeholder - in real app would use iframe */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-secondary/50">
                <MapPin size={48} className="mb-4 opacity-50" />
                <p className="font-medium text-lg">Map View</p>
                <p className="text-sm">Tirupati, Andhra Pradesh</p>
              </div>
            </div>

          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
