import { create } from 'zustand';

type Language = 'en' | 'te';

interface LanguageState {
  lang: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguage = create<LanguageState>((set) => ({
  lang: 'en',
  setLanguage: (lang) => set({ lang }),
  toggleLanguage: () => set((state) => ({ lang: state.lang === 'en' ? 'te' : 'en' })),
}));
