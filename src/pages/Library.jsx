import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlassIcon, MusicalNoteIcon, FunnelIcon } from "@heroicons/react/24/outline";
import MidiPreview from "../components/MidiPreview";
import QualityBadge from "../components/QualityBadge";

const API = import.meta.env.VITE_API_URL;
const FILTERS = [
  { value: "all", label: "library.filter_all" },
  { value: "guitarpro", label: "library.filter_tabs" },
  { value: "midi", label: "library.filter_midi" },
  { value: "ludilo", label: "library.filter_ludilo" },
];

export default function Library() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [source, setSource] = useState("all");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q, p = 1, src = source) => {
    if (!q || q.length < 2) return;
    setLoading(true);
    setSearchParams({ q }, { replace: true });
    try {
      const params = new URLSearchParams({ q, page: p, pageSize: 20 });
      if (src !== "all") params.set("source", src);
      const res = await fetch(`${API}/library/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 0);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(() => search(query, 1, source), 400);
      return () => clearTimeout(timer);
    }
    if (!query) { setResults([]); setSearched(false); }
  }, [query, source, search]);

  const handlePage = (p) => {
    setPage(p);
    search(query, p, source);
  };

  return (
    <main className="min-h-screen pt-20 px-4 pb-12">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white mb-2">
            {t("library.title")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{t("library.subtitle")}</p>

          {/* Search bar */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("library.search_placeholder")}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-surface-dark-card border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ludilo-500/50 dark:focus:ring-neon-cyan/30 transition-all"
              />
            </div>
            <div className="relative">
              <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="pl-9 pr-4 py-3 rounded-xl bg-white dark:bg-surface-dark-card border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-ludilo-500/50 dark:focus:ring-neon-cyan/30 appearance-none cursor-pointer"
              >
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{t(f.label)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          {searched && !loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t("library.results_count", { count: total })}
            </p>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Results */}
          <AnimatePresence mode="wait">
            {!loading && results.length > 0 && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {results.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-surface-dark-card border border-gray-100 dark:border-white/5 hover:border-ludilo-300 dark:hover:border-neon-cyan/20 transition-all group cursor-pointer"
                    onClick={() => navigate(`/library/view?blobPath=${encodeURIComponent(item.blobPath)}&title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}&source=${encodeURIComponent(item.source)}&format=${encodeURIComponent(item.format)}`)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-ludilo-100 dark:bg-neon-cyan/10 flex items-center justify-center flex-shrink-0">
                      <MusicalNoteIcon className="w-5 h-5 text-ludilo-600 dark:text-neon-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.artist}</p>
                    </div>
                    <MidiPreview blobPath={item.blobPath} title={item.title} />
                    <QualityBadge source={item.source} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {searched && !loading && results.length === 0 && (
            <div className="text-center py-16">
              <MusicalNoteIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">{t("library.no_results")}</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && !loading && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <button onClick={() => handlePage(page - 1)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                  {t("library.prev")}
                </button>
              )}
              <span className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <button onClick={() => handlePage(page + 1)} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                  {t("library.next")}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
