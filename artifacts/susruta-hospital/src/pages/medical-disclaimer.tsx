import React from "react";
import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

export default function MedicalDisclaimer() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50/40 via-white to-green-50/20">

      {/* Header */}
      <div className="bg-[#FFFFFF] text-[#0A2B21]">
        <div className="w-full mx-auto px-[5%] py-5 flex flex-col md:flex-row items-center justify-between gap-3">

          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Susruta Hospital"
              className="h-8 w-auto object-contain"
            />
          </div>

          <a
            href="/portal"
            className="flex items-center gap-1.5 text-[#D95B2F] hover:underline text-[16px] md:text-[18px] hover:text-[#D95B2F] transition-colors"
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
              <Shield size={22} className="text-[#1a3d2b]" />
            </div>

            <div>
              <h1 className="text-[22px] md:text-[24px] font-bold text-[#0A2B21]">
                Privacy & Medical Data Disclaimer
              </h1>

              <p className="text-[16px] md:text-[18px] text-gray-500 mt-0.5">
                Susruta Hospital — Patient Portal
              </p>
            </div>

          </div>

          <div className="space-y-8 text-[16px] md:text-[18px] text-gray-700 leading-relaxed">

            {/* Section 1 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                Purpose of Data Collection
              </h2>

              <p className="text-[16px] md:text-[18px] mb-3">
                This platform allows patients to securely submit their personal details and medical reports for the purpose of consultation with <strong>Dr. Murali Krishna Parasaram</strong>.
              </p>

              <p className="text-[16px] md:text-[18px] mb-2">
                The information collected is used only to:
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Review medical history and reports
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Provide consultation guidance and recommendations
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Maintain records for future follow-up consultations
                </li>
              </ul>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                Nature of Data Collected
              </h2>

              <p className="text-[16px] md:text-[18px] mb-2">
                The platform may collect and store:
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Name and contact details
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Basic personal information
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Medical history and uploaded reports
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Consultation notes and prescriptions
                </li>
              </ul>

              <p className="text-[16px] md:text-[18px] mt-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-amber-800 font-medium">
                This information is treated as confidential medical data.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                Consent
              </h2>

              <p className="text-[16px] md:text-[18px] mb-2">
                By registering on this website and uploading your information, you:
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Consent to the collection and use of your data for consultation purposes
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Confirm that the information provided is accurate to the best of your knowledge
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Understand that your data will be reviewed by the doctor for medical guidance
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  4
                </span>
                Confidentiality & Data Protection
              </h2>

              <p className="text-[16px] md:text-[18px] mb-2">
                We take reasonable steps to protect your personal and medical information from unauthorized access, misuse, or disclosure. Your data will:
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Not be shared with third parties for marketing purposes
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Not be sold or commercially distributed
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Be accessible only to authorised personnel involved in your consultation
                </li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  5
                </span>
                Data Storage & Access
              </h2>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Your records will be stored securely within the system
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  You may access your own records through your login account
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Data will be retained only for as long as necessary for consultation and follow-up purposes
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  6
                </span>
                Cross-Border Use
              </h2>

              <p className="text-[16px] md:text-[18px]">
                As this service is accessible internationally, your data may be accessed by the doctor from India and by authorised coordinators from other locations solely for consultation support. By using this platform, you acknowledge and accept such cross-border access.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  7
                </span>
                Medical Disclaimer
              </h2>

              <p className="text-[16px] md:text-[18px] mb-2">
                This platform provides consultation support based on Ayurvedic principles.
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  It does not replace emergency or critical medical care
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Patients are advised to consult local licensed medical practitioners where necessary
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  No guarantee of outcomes or results is provided
                </li>
              </ul>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  8
                </span>
                Limitation of Liability
              </h2>

              <p className="text-[16px] md:text-[18px] mb-2">
                While every effort is made to provide appropriate guidance, the organisers and the platform are not liable for:
              </p>

              <ul className="text-[16px] md:text-[18px] space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Individual health outcomes
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Interpretation or misuse of medical advice
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#1a3d2b] mt-1">•</span>
                  Decisions taken without proper consultation
                </li>
              </ul>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  9
                </span>
                Updates to Policy
              </h2>

              <p className="text-[16px] md:text-[18px]">
                This disclaimer may be updated from time to time to reflect improvements in the platform or changes in regulatory requirements. Continued use of the portal after such changes constitutes your acceptance of the updated policy.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="!text-[20px] font-bold text-[#0A2B21] mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1a3d2b] text-white text-[16px] md:text-[18px] font-bold flex items-center justify-center shrink-0">
                  10
                </span>
                Contact
              </h2>

              <p className="text-[16px] md:text-[18px]">
                For any questions regarding your data or privacy, please contact us at{" "}
                <a
                  href="mailto:noreply@susrutahospital.com"
                  className="text-[#1a3d2b] font-medium hover:underline"
                >
                  noreply@susrutahospital.com
                </a>
              </p>
            </section>

          </div>

          {/* Footer note */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-center">
            <p className="text-[14px] md:text-[16px] text-gray-400">
              Susruta Hospital · 119, Ramulavari North Mada Street, Tirupati - 517 507 · Effective from 2024
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
}