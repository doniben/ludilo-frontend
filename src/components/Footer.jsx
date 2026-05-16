import { useTranslation } from "react-i18next";

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 dark:border-white/5 bg-surface-light dark:bg-surface-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-neon-cyan to-neon-magenta" />
            <span className="font-display font-bold text-lg text-gradient">Ludilo</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500">{t("footer.tagline")}</p>
          <p className="text-xs text-gray-400 dark:text-gray-600">
            © {year} Ludilo. {t("footer.rights")}.
          </p>
        </div>
      </div>
    </footer>
  );
}
