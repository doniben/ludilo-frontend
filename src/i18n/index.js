import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "./es.json";
import eo from "./eo.json";
import en from "./en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es }, eo: { translation: eo }, en: { translation: en } },
    fallbackLng: "es",
    interpolation: { escapeValue: false },
  });

export default i18n;
