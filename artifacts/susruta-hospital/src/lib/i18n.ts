type TranslationMap = {
  [key: string]: {
    en: string;
    te: string;
  };
};

export const translations: TranslationMap = {
  // Navigation
  "nav.home": { en: "Home", te: "ముఖపుట" },
  "nav.about": { en: "About Doctor", te: "డాక్టర్ గురించి" },
  "nav.achievements": { en: "Achievements", te: "విజయాలు" },
  "nav.services": { en: "Services", te: "సేవలు" },
  "nav.appointments": { en: "Appointments", te: "అపాయింట్‌మెంట్‌లు" },
  "nav.testimonials": { en: "Testimonials", te: "రోగుల అనుభవాలు" },
  "nav.contact": { en: "Contact", te: "సంప్రదించండి" },
  "nav.admin": { en: "Admin", te: "అడ్మిన్" },
  
  // General
  "hospital.name": { en: "Susruta Hospital", te: "శుశ్రుత హాస్పిటల్" },
  "hospital.tagline": { en: "An Exclusive Ayurvedic Medical Care", te: "ప్రత్యేక ఆయుర్వేద వైద్య సంరక్షణ" },
  "doctor.name": { en: "Dr. P. Murali Krishna", te: "డా. పి. మురళీకృష్ణ" },
  "btn.book": { en: "Book Appointment", te: "అపాయింట్‌మెంట్ బుక్ చేయండి" },
  "btn.read_more": { en: "Read More", te: "మరింత చదవండి" },
  "btn.submit": { en: "Submit", te: "సమర్పించండి" },
  "btn.cancel": { en: "Cancel", te: "రద్దు చేయండి" },
  "loading": { en: "Loading...", te: "లోడ్ అవుతోంది..." },
  "error": { en: "An error occurred", te: "లోపం జరిగింది" },

  // Forms
  "form.name": { en: "Patient Name", te: "రోగి పేరు" },
  "form.phone": { en: "Phone Number", te: "ఫోన్ నంబర్" },
  "form.email": { en: "Email (Optional)", te: "ఈమెయిల్ (ఐచ్ఛికం)" },
  "form.reason": { en: "Reason for Visit", te: "సందర్శనకు కారణం" },
  "form.month": { en: "Select Month", te: "నెల ఎంచుకోండి" },
  "form.date": { en: "Select Date", te: "తేదీ ఎంచుకోండి" },
  "form.time": { en: "Select Time", te: "సమయం ఎంచుకోండి" },
  
  // Admin
  "admin.login": { en: "Admin Login", te: "అడ్మిన్ లాగిన్" },
  "admin.username": { en: "Username", te: "వాడుకరి పేరు" },
  "admin.password": { en: "Password", te: "పాస్‌వర్డ్" },
  "admin.dashboard": { en: "Dashboard", te: "డ్యాష్‌బోర్డ్" },
  "admin.manage_appointments": { en: "Manage Appointments", te: "అపాయింట్‌మెంట్‌లను నిర్వహించండి" },
  "admin.manage_availability": { en: "Manage Availability", te: "లభ్యతను నిర్వహించండి" },
  "admin.manage_testimonials": { en: "Manage Testimonials", te: "టెస్టిమోనియల్స్ నిర్వహించండి" },
  "admin.settings": { en: "Settings", te: "సెట్టింగులు" },
  "admin.logout": { en: "Logout", te: "లాగ్అవుట్" },
};

export function useTranslation() {
  const lang = 'en'; // Ideally hook into zustand store, but we will pass lang directly in components to avoid react hook rules issues if not pure
  return (key: keyof typeof translations, currentLang: 'en' | 'te') => {
    if (!translations[key]) {
      console.warn(`Translation key missing: ${key}`);
      return key;
    }
    return translations[key][currentLang];
  };
}
