import React from "react";
import { motion } from "framer-motion";
import { FileText, ArrowLeft } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const Section = ({ num, title, children }: { num: number; title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-xs font-bold flex items-center justify-center shrink-0">{num}</span>
      {title}
    </h2>
    <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2"><span className="text-[#1a3d2b] mt-1 shrink-0">•</span><span>{children}</span></li>
);

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-green-50/20">
      <div className="bg-[#1a3d2b] text-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={logoImg} alt="Susruta Hospital" className="h-8 w-auto object-contain brightness-0 invert" />
          <a href="/portal" className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
            <ArrowLeft size={14} /> Back to Portal
          </a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#1a3d2b]/10 flex items-center justify-center">
              <FileText size={22} className="text-[#1a3d2b]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Terms & Conditions</h1>
              <p className="text-sm text-gray-500 mt-0.5">Susruta Hospital Patient Portal · Last updated: January 2025</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-8 text-sm text-amber-800">
            <strong>Please read these Terms and Conditions carefully</strong> before using the Susruta Hospital Patient Portal. By creating an account or using this platform, you agree to be bound by these terms.
          </div>

          <div className="space-y-8">

            <Section num={1} title="Acceptance of Terms">
              <p>By accessing or using the Susruta Hospital Patient Portal ("Portal"), you confirm that you have read, understood, and agree to these Terms and Conditions ("Terms"). If you do not agree, please do not use this Portal.</p>
              <p>These Terms govern your use of the Portal and services provided by <strong>Susruta Hospital</strong>, 119, Ramulavari North Mada Street, Tirupati - 517 507, Andhra Pradesh, India.</p>
            </Section>

            <Section num={2} title="Eligibility">
              <ul className="space-y-1.5 ml-1">
                <Bullet>You must be at least 18 years of age to register independently. Minors may be registered by a parent or legal guardian.</Bullet>
                <Bullet>You must provide accurate and truthful information during registration and throughout your use of the Portal.</Bullet>
                <Bullet>You are responsible for maintaining the confidentiality of your account credentials.</Bullet>
              </ul>
            </Section>

            <Section num={3} title="Nature of Services">
              <p>The Portal provides an online platform to:</p>
              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Book and manage appointments with Dr. P. Murali Krishna (Ayurvedic Physician)</Bullet>
                <Bullet>Conduct online video consultations via a secure video conferencing system</Bullet>
                <Bullet>Upload medical documents and reports for review</Bullet>
                <Bullet>Receive digital prescriptions and doctor's notes</Bullet>
                <Bullet>Maintain a personal health record for consultation history</Bullet>
              </ul>
              <p className="mt-3 font-medium text-gray-800">These services are consultative in nature and are based on traditional Ayurvedic medicine principles. They do not constitute emergency medical services.</p>
            </Section>

            <Section num={4} title="Appointment Booking & Cancellations">
              <ul className="space-y-1.5 ml-1">
                <Bullet>Appointments are subject to the availability of the doctor and clinic.</Bullet>
                <Bullet>You are responsible for attending your booked appointment at the scheduled time.</Bullet>
                <Bullet>Online consultations will be initiated via the platform's video system. You must ensure a stable internet connection.</Bullet>
                <Bullet>Repeated no-shows may result in temporary suspension of booking privileges.</Bullet>
                <Bullet>Susruta Hospital reserves the right to cancel or reschedule appointments due to unforeseen circumstances, with advance notice where possible.</Bullet>
              </ul>
            </Section>

            <Section num={5} title="User Responsibilities">
              <p>As a user of this Portal, you agree to:</p>
              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Provide accurate, complete, and up-to-date medical and personal information</Bullet>
                <Bullet>Not share your account credentials with any other person</Bullet>
                <Bullet>Not upload inappropriate, false, or misleading medical documents</Bullet>
                <Bullet>Use the Portal solely for legitimate healthcare consultation purposes</Bullet>
                <Bullet>Not attempt to interfere with, hack, or disrupt any aspect of the Portal</Bullet>
                <Bullet>Comply with all applicable local, national, and international laws</Bullet>
              </ul>
            </Section>

            <Section num={6} title="Medical Advice Disclaimer">
              <p>All guidance provided through this Portal is based on Ayurvedic principles and the professional opinion of Dr. P. Murali Krishna.</p>
              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Consultations through this Portal do not replace in-person emergency medical care.</Bullet>
                <Bullet>In case of a medical emergency, please contact local emergency services immediately.</Bullet>
                <Bullet>The doctor's recommendations are advisory and based on information you provide. Incomplete or inaccurate information may affect the quality of advice.</Bullet>
                <Bullet>No guarantee of specific health outcomes is provided or implied.</Bullet>
              </ul>
            </Section>

            <Section num={7} title="Payments & Fees">
              <ul className="space-y-1.5 ml-1">
                <Bullet>Consultation fees, if applicable, will be communicated at the time of booking or during the consultation.</Bullet>
                <Bullet>Payments are processed securely and receipts will be provided where applicable.</Bullet>
                <Bullet>Refund policies, if any, will be communicated on a case-by-case basis by the clinic administration.</Bullet>
              </ul>
            </Section>

            <Section num={8} title="Intellectual Property">
              <p>All content on this Portal, including text, graphics, logos, and software, is the property of Susruta Hospital or its licensors and is protected by applicable intellectual property laws.</p>
              <p>You may not reproduce, copy, distribute, or otherwise exploit any content without prior written permission from Susruta Hospital.</p>
            </Section>

            <Section num={9} title="Termination of Access">
              <p>We reserve the right to suspend or terminate your account and access to the Portal at our sole discretion if:</p>
              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>You violate any of these Terms and Conditions</Bullet>
                <Bullet>You provide false or misleading information</Bullet>
                <Bullet>Your conduct is deemed inappropriate, abusive, or harmful</Bullet>
                <Bullet>There is reasonable suspicion of fraudulent activity</Bullet>
              </ul>
            </Section>

            <Section num={10} title="Limitation of Liability">
              <p>To the fullest extent permitted by law, Susruta Hospital and its personnel shall not be liable for:</p>
              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Any indirect, incidental, or consequential damages arising from use of the Portal</Bullet>
                <Bullet>Loss or corruption of data</Bullet>
                <Bullet>Technical failures, downtime, or service interruptions</Bullet>
                <Bullet>Outcomes resulting from incomplete, inaccurate, or misleading information provided by the user</Bullet>
              </ul>
            </Section>

            <Section num={11} title="Governing Law">
              <p>These Terms shall be governed by and construed in accordance with the laws of <strong>India</strong>. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of Tirupati, Andhra Pradesh.</p>
            </Section>

            <Section num={12} title="Changes to Terms">
              <p>We reserve the right to update these Terms at any time. Material changes will be communicated via the Portal or by email. Continued use of the Portal after any changes constitutes your acceptance of the revised Terms.</p>
            </Section>

            <Section num={13} title="Contact Us">
              <p>If you have questions about these Terms, please contact:</p>
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm">
                <p className="font-semibold text-gray-900">Susruta Hospital</p>
                <p className="text-gray-600">119, Ramulavari North Mada Street, Tirupati - 517 507</p>
                <p className="text-gray-600">Andhra Pradesh, India</p>
                <a href="mailto:noreply@susrutahospital.com" className="text-[#1a3d2b] font-medium hover:underline">
                  noreply@susrutahospital.com
                </a>
              </div>
            </Section>
          </div>

          <div className="mt-12 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">Susruta Hospital · Tirupati · © 2025 All Rights Reserved</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
