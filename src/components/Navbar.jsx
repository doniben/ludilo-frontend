import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import { SunIcon, MoonIcon, Bars3Icon, XMarkIcon, UserCircleIcon } from "@heroicons/react/24/outline";

const languages = [
  { code: "es", label: "ES", flag: "🇲🇽" },
  { code: "eo", label: "EO", flag: "🟢" },
  { code: "en", label: "EN", flag: "🇺🇸" },
];

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("ludilo-user");
    if (stored) setUser(JSON.parse(stored));
    const handleStorage = () => {
      const s = localStorage.getItem("ludilo-user");
      setUser(s ? JSON.parse(s) : null);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  return (
    <nav className="fixed top-0 inset-x-0 z-40 border-b border-white/5 backdrop-blur-2xl bg-surface-light/80 dark:bg-surface-dark/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-magenta opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-[2px] rounded-[6px] bg-surface-dark flex items-center justify-center">
                <span className="text-neon-cyan font-display font-bold text-sm">L</span>
              </div>
            </div>
            <span className="font-display font-bold text-xl tracking-tight">
              <span className="text-gradient">Ludilo</span>
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("nav.library")}
            </a>
            <a href="#pricing" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              {t("nav.pricing")}
            </a>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Language selector */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-mono font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              >
                <span>{currentLang.flag}</span>
                <span>{currentLang.label}</span>
              </button>
              <AnimatePresence>
                {langOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 mt-1 w-32 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-surface-dark-card shadow-xl overflow-hidden"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                          i18n.language === lang.code ? "text-accent font-semibold" : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span>{lang.flag}</span>
                        <span>{t(`language.${lang.code}`)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            {/* Auth buttons */}
            <div className="hidden md:flex items-center gap-2 ml-2">
              {user ? (
                <a href="/dashboard" className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  <UserCircleIcon className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{user.username}</span>
                </a>
              ) : (
                <>
                  <a href="/login" className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                    {t("nav.login")}
                  </a>
                  <a href="/register" className="btn-primary text-xs py-2">
                    {t("nav.register")}
                  </a>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400"
            >
              {mobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-gray-200 dark:border-white/5 bg-white dark:bg-surface-dark-elevated overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3">
              <a href="#features" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("nav.library")}</a>
              <a href="#pricing" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("nav.pricing")}</a>
              <hr className="border-gray-200 dark:border-white/10" />
              <a href="/login" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("nav.login")}</a>
              <a href="/register" className="block btn-primary text-center text-xs py-2">{t("nav.register")}</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
