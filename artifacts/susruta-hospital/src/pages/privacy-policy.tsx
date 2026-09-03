import React from "react";
import { motion } from "framer-motion";
import { Lock, ArrowLeft } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

const Section = ({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) => (
  <section>
    <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
        {num}
      </span>
      {title}
    </h2>

    <div className="text-[16px] md:text-[18px] text-gray-700 leading-relaxed space-y-2">
      {children}
    </div>
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <span className="text-[#1a3d2b] mt-1 shrink-0">•</span>
    <span>{children}</span>
  </li>
);

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-green-50/20">

      {/* Header */}
      <div className="bg-[#FFFFFF] text-[#0A2B21]">
        <div className="w-full mx-auto px-[5%] py-5 flex flex-col md:flex-row items-center justify-between gap-3">

          <img
            src={logoImg}
            alt="Susruta Hospital"
            className="h-8 w-auto object-contain"
          />

          <a
            href="/portal"
            className="flex items-center gap-2 text-[#D95B2F] hover:underline text-[16px] md:text-[18px] hover:text-[#D95B2F] transition-colors"
          >
            <ArrowLeft size={18} /> Back to Portal
          </a>

        </div>
      </div>

      {/* Main Content */}
      <div className="w-full mx-auto bg-[#F5F2E9] px-[7%] py-12">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >

          {/* Title */}
          <div className="flex items-center gap-3 mb-8">

            <div className="w-12 h-12 rounded-2xl bg-[#1a3d2b]/10 flex items-center justify-center">
              <Lock size={22} className="text-[#1a3d2b]" />
            </div>

            <div>
              <h1 className="text-[22px] md:text-[24px] font-bold text-[#0A2B21]">
                Privacy Policy
              </h1>

              <p className="text-[16px] md:text-[18px] text-gray-500 mt-0.5">
                Susruta Hospital Patient Portal · Last updated: January 2025
              </p>
            </div>

          </div>

          {/* Intro */}
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-8 text-[16px] md:text-[18px] text-green-800">
            At Susruta Hospital, your privacy is our priority. This Privacy Policy explains how we collect, use, and protect your personal and medical information when you use our Patient Portal.
          </div>

          <div className="space-y-8">

            {/* Section 1 */}
            <Section num={1} title="Who We Are">
              <p>
                <strong>Susruta Hospital</strong> is an Ayurvedic healthcare institution operated under the guidance of Dr. P. Murali Krishna, located at 119, Ramulavari North Mada Street, Tirupati - 517 507, Andhra Pradesh, India. We are the data controller for information collected via this Portal.
              </p>
            </Section>

            {/* Section 2 */}
            <Section num={2} title="Information We Collect">
              <p>
                <strong>Personal Information:</strong>
              </p>

              <ul className="space-y-1.5 ml-1 mt-1">
                <Bullet>Full name, email address, and phone number</Bullet>
                <Bullet>Country of residence</Bullet>
                <Bullet>Account credentials (password stored in encrypted form)</Bullet>
              </ul>

              <p className="mt-3">
                <strong>Medical Information:</strong>
              </p>

              <ul className="space-y-1.5 ml-1 mt-1">
                <Bullet>Medical history and health conditions you disclose during consultation</Bullet>
                <Bullet>Documents and reports you upload (lab reports, scans, prescriptions)</Bullet>
                <Bullet>Consultation notes and prescriptions issued by the doctor</Bullet>
                <Bullet>Appointment history and booking records</Bullet>
              </ul>

              <p className="mt-3">
                <strong>Technical Information:</strong>
              </p>

              <ul className="space-y-1.5 ml-1 mt-1">
                <Bullet>IP address and browser/device information (for security and fraud prevention)</Bullet>
                <Bullet>Session tokens stored as secure, HTTP-only cookies</Bullet>
                <Bullet>Usage data such as pages visited and actions performed within the Portal</Bullet>
              </ul>
            </Section>

            {/* Section 3 */}
            <Section num={3} title="How We Use Your Information">
              <p>We use your information exclusively for:</p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Providing Ayurvedic medical consultation and advisory services</Bullet>
                <Bullet>Managing your appointments and sending appointment-related notifications</Bullet>
                <Bullet>Sending account verification and security emails</Bullet>
                <Bullet>Maintaining your consultation and prescription records</Bullet>
                <Bullet>Improving the Portal's functionality and user experience</Bullet>
                <Bullet>Complying with applicable legal and regulatory obligations</Bullet>
              </ul>

              <p className="mt-3 font-medium text-gray-800">
                We do not use your data for advertising, profiling, or any commercial purpose beyond your healthcare.
              </p>
            </Section>

            {/* Section 4 */}
            <Section num={4} title="Legal Basis for Processing">
              <p>We process your data under the following legal bases:</p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>
                  <strong>Consent:</strong> You provide explicit consent by registering and using the Portal
                </Bullet>
                <Bullet>
                  <strong>Contract:</strong> Processing is necessary to fulfil the consultation services you request
                </Bullet>
                <Bullet>
                  <strong>Legitimate Interests:</strong> Security, fraud prevention, and Portal improvement
                </Bullet>
                <Bullet>
                  <strong>Legal Obligation:</strong> Where required by applicable law
                </Bullet>
              </ul>
            </Section>

            {/* Section 5 */}
            <Section num={5} title="Data Sharing & Third Parties">
              <p>
                We do not sell, rent, or trade your personal or medical data. We may share data with:
              </p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>
                  <strong>Authorised clinical staff</strong> directly involved in your care (e.g., administrative coordinators supporting the doctor)
                </Bullet>
                <Bullet>
                  <strong>Cloud infrastructure providers</strong> (for secure data storage) under strict data processing agreements
                </Bullet>
                <Bullet>
                  <strong>Email service providers</strong> for sending transactional notifications (verification, appointment confirmations)
                </Bullet>
                <Bullet>
                  <strong>Law enforcement or regulatory bodies</strong> where legally required
                </Bullet>
              </ul>

              <p className="mt-3">
                All third-party providers are vetted and contractually obligated to maintain confidentiality and security of your data.
              </p>
            </Section>

            {/* Section 6 */}
            <Section num={6} title="International Data Transfers">
              <p>
                As this Portal is accessible globally, your data may be stored on servers or accessed by authorised personnel outside your country of residence. In all cases, we ensure appropriate safeguards are in place to protect your data in accordance with applicable privacy laws.
              </p>
            </Section>

            {/* Section 7 */}
            <Section num={7} title="Data Retention">
              <ul className="space-y-1.5 ml-1">
                <Bullet>
                  Your account data is retained for the duration of your account's existence and up to 5 years after your last consultation, to allow for follow-up care.
                </Bullet>
                <Bullet>
                  Medical records are retained as required by applicable medical record-keeping regulations.
                </Bullet>
                <Bullet>
                  You may request deletion of your account and associated data (see Section 9 — Your Rights).
                </Bullet>
              </ul>
            </Section>

            {/* Section 8 */}
            <Section num={8} title="Data Security">
              <p>We implement industry-standard security measures, including:</p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>HTTPS encryption for all data transmission</Bullet>
                <Bullet>Bcrypt hashing for all stored passwords</Bullet>
                <Bullet>HTTP-only, secure session cookies to prevent cross-site scripting attacks</Bullet>
                <Bullet>Role-based access controls ensuring only authorised personnel access medical data</Bullet>
                <Bullet>Regular security reviews and updates</Bullet>
              </ul>

              <p className="mt-3">
                No system is 100% secure. We encourage you to use a strong, unique password and to log out after each session, especially on shared devices.
              </p>
            </Section>

            {/* Section 9 */}
            <Section num={9} title="Your Rights">
              <p>
                Depending on your location, you may have the following rights regarding your personal data:
              </p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>
                  <strong>Right to Access:</strong> Request a copy of the personal data we hold about you
                </Bullet>
                <Bullet>
                  <strong>Right to Rectification:</strong> Request correction of inaccurate or incomplete data
                </Bullet>
                <Bullet>
                  <strong>Right to Erasure:</strong> Request deletion of your personal data (subject to legal obligations)
                </Bullet>
                <Bullet>
                  <strong>Right to Restriction:</strong> Request that we limit how we process your data
                </Bullet>
                <Bullet>
                  <strong>Right to Data Portability:</strong> Request your data in a structured, machine-readable format
                </Bullet>
                <Bullet>
                  <strong>Right to Withdraw Consent:</strong> Withdraw your consent at any time (this may affect your ability to use the Portal)
                </Bullet>
              </ul>

              <p className="mt-3">
                To exercise any of these rights, please contact us at{" "}
                <a
                  href="mailto:noreply@susrutahospital.com"
                  className="text-[#1a3d2b] font-medium hover:underline"
                >
                  noreply@susrutahospital.com
                </a>
                . We will respond within 30 days.
              </p>
            </Section>

            {/* Section 10 */}
            <Section num={10} title="Cookies & Session Tokens">
              <p>
                This Portal uses <strong>HTTP-only cookies</strong> to manage your authenticated session. These cookies:
              </p>

              <ul className="space-y-1.5 ml-1 mt-2">
                <Bullet>Are strictly necessary for the Portal to function</Bullet>
                <Bullet>Do not track your browsing activity outside this Portal</Bullet>
                <Bullet>Expire automatically after 30 days of inactivity</Bullet>
              </ul>

              <p className="mt-2">
                We do not use advertising cookies, tracking pixels, or third-party analytics cookies.
              </p>
            </Section>

            {/* Section 11 */}
            <Section num={11} title="Children's Privacy">
              <p>
                This Portal is not intended for children under 18 years of age. Minors may only use the Portal when registered and supervised by a parent or legal guardian. We do not knowingly collect personal data from children without parental consent.
              </p>
            </Section>

            {/* Section 12 */}
            <Section num={12} title="Changes to This Policy">
              <p>
                We may update this Privacy Policy periodically. When we do, we will revise the "Last updated" date at the top. If changes are material, we will notify you via email or a prominent notice on the Portal. Your continued use of the Portal after changes constitutes acceptance of the updated policy.
              </p>
            </Section>

            {/* Section 13 */}
            <Section num={13} title="Contact & Complaints">
              <p>
                For privacy-related questions or to make a complaint, contact our Data Protection contact:
              </p>

              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="font-semibold text-gray-900">
                  Susruta Hospital — Data Privacy
                </p>

                <p className="text-gray-600">
                  119, Ramulavari North Mada Street, Tirupati - 517 507
                </p>

                <p className="text-gray-600">
                  Andhra Pradesh, India
                </p>

                <a
                  href="mailto:noreply@susrutahospital.com"
                  className="text-[#1a3d2b] font-medium hover:underline"
                >
                  noreply@susrutahospital.com
                </a>
              </div>

              <p className="mt-3">
                If you are unsatisfied with our response, you have the right to lodge a complaint with the relevant data protection authority in your country.
              </p>
            </Section>

          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-center">
            <p className="text-[14px] md:text-[16px] text-gray-400">
              Susruta Hospital · Tirupati · © 2025 All Rights Reserved
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}