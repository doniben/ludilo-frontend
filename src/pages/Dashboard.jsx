import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FireIcon, MusicalNoteIcon, TrophyIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("ludilo-user");
    if (!stored) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(stored));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("ludilo-token");
    localStorage.removeItem("ludilo-user");
    navigate("/");
  };

  if (!user) return null;

  return (
    <main className="min-h-screen pt-20 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white">
              {user.username}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${user.plan === "premium" ? "bg-accent-soft text-accent" : "bg-gray-100 dark:bg-white/5 text-gray-500"}`}>
                {user.plan}
              </span>
              <span className="ml-2">{user.email}</span>
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Logout
          </button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <FireIcon className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Racha</p>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
              <MusicalNoteIcon className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Canciones</p>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-neon-violet/10 flex items-center justify-center">
              <TrophyIcon className="w-5 h-5 text-neon-violet" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dominadas</p>
            </div>
          </motion.div>
        </div>

        {/* Upload CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card-solid p-8 text-center border-dashed border-2 border-gray-300 dark:border-white/10"
        >
          <div className="w-12 h-12 rounded-xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
            <ArrowUpTrayIcon className="w-6 h-6 text-accent" />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{t("hero.cta")}</p>
          <a href="/upload" className="btn-primary inline-block">
            {t("nav.upload")}
          </a>
        </motion.div>
      </div>
    </main>
  );
}
