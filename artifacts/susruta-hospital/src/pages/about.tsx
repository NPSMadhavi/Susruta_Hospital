import React from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { useLanguage } from "@/store/use-language";
import drPhoto from "@assets/Dr_Murali_Krishna_1773837837953.jpeg";

export default function About() {
  const { lang } = useLanguage();

  return (
    <PublicLayout>
      <div className="bg-secondary/30 py-12 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            {lang === 'en' ? "About The Doctor" : "డాక్టర్ గురించి"}
          </h1>
        </div>
      </div>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row gap-12">
          
          <div className="w-full lg:w-1/3">
            <div className="sticky top-28">
              <div className="rounded-2xl overflow-hidden shadow-xl border-4 border-white">
                <img src={drPhoto} alt="Dr. P. Murali Krishna" className="w-full h-auto" />
              </div>
              <div className="mt-6 bg-white p-6 rounded-2xl border border-border shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-2 text-primary">Dr. P. Murali Krishna</h3>
                <ul className="space-y-2 text-sm text-muted-foreground font-medium">
                  <li>B.A.M.S. (Gold Medalist)</li>
                  <li>M.D. (Ay)</li>
                  <li>Ph.D. (Ay)</li>
                  <li>F.R.A.V.</li>
                  <li>D.Yoga</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-2/3 prose prose-green max-w-none text-foreground/80">
            <h2 className="font-serif text-3xl text-foreground font-bold mb-6">Brief Biodata</h2>
            
            <p className="text-lg leading-relaxed mb-6">
              Dr. P. Murali Krishna is a highly distinguished and decorated Ayurvedic Physician, Academician, and Researcher. He has served as the Principal of the prestigious S.V. Ayurvedic College, T.T. Devasthanams, Tirupati.
            </p>

            <h3 className="font-serif text-2xl text-foreground font-bold mt-10 mb-4">Academic Brilliance</h3>
            <p>
              His academic journey has been marked by excellence from the very beginning. He completed his B.A.M.S. as a Gold Medalist and went on to acquire M.D.(Ay), Ph.D.(Ay), F.R.A.V., and a Diploma in Yoga.
            </p>

            <h3 className="font-serif text-2xl text-foreground font-bold mt-10 mb-4">Professional Experience</h3>
            <ul className="space-y-3 list-disc pl-5">
              <li><strong>Principal (Retd.)</strong>, S.V. Ayurvedic College, T.T. Devasthanams, Tirupati.</li>
              <li><strong>Consultant Ayurvedic Specialist</strong>, Susruta Hospital, Tirupati.</li>
              <li><strong>SBI Authorised Ayurvedic Doctor</strong>.</li>
            </ul>

            <h3 className="font-serif text-2xl text-foreground font-bold mt-10 mb-4">Scholarly Contributions</h3>
            <div className="grid grid-cols-2 gap-4 my-6">
              <div className="bg-secondary/50 p-6 rounded-2xl text-center border border-border">
                <div className="text-4xl font-bold text-primary mb-2">30+</div>
                <div className="text-sm font-semibold">Publications</div>
              </div>
              <div className="bg-secondary/50 p-6 rounded-2xl text-center border border-border">
                <div className="text-4xl font-bold text-primary mb-2">147+</div>
                <div className="text-sm font-semibold">Guest Lectures</div>
              </div>
              <div className="bg-secondary/50 p-6 rounded-2xl text-center border border-border">
                <div className="text-4xl font-bold text-primary mb-2">15+</div>
                <div className="text-sm font-semibold">International Conferences</div>
              </div>
              <div className="bg-secondary/50 p-6 rounded-2xl text-center border border-border">
                <div className="text-4xl font-bold text-primary mb-2">30+</div>
                <div className="text-sm font-semibold">National Conferences</div>
              </div>
            </div>

            <p className="mt-8">
              He has delivered over 147 Guest Lectures as a Resource Person and Chaired Scientific Sessions at numerous National and International Seminars.
            </p>

          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
