import React, { createContext, useContext, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { T, LangCode, TranslationKey, LANGUAGES } from "@/i18n/translations";

interface LanguageContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: TranslationKey) => string;
  languages: typeof LANGUAGES;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => T.en[key],
  languages: LANGUAGES,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");

  const setLang = useCallback(async (newLang: LangCode) => {
    setLangState(newLang);
    try {
      await AsyncStorage.setItem("@aist_lang", newLang);
    } catch {}
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const translations = T[lang] as Record<string, string>;
      return translations[key] ?? T.en[key] ?? key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
