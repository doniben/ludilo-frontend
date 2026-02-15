import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MusicalNoteIcon } from "@heroicons/react/24/outline";
import ScoreView from "../components/ScoreView";
import PianoRollView from "../components/PianoRollView";
import TabView from "../components/TabView";

const API = import.meta.env.VITE_API_URL;
const VIEWS = ["pianoroll", "score", "tab"];

export default function SongView() {
  const { songId } = useParams();
  const { t } = useTranslation();
  const [song, setSong] = useState(null);
  const [view, setView] = useState("pianoroll");
  const [midiUrl, setMidiUrl] = useState(null);
  const [musicXmlUrl, setMusicXmlUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("ludilo-token");

  useEffect(() => {
    const load = async () => {
      try {
        // Get song info
        const res = await fetch(`${API}/songs/${songId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setSong(data);

        // Get MIDI preview URL
        const blobPath = data.midiFiles?.[0] || data.originalBlobPath;
        if (blobPath) {
          const previewRes = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(blobPath)}`);
          const previewData = await previewRes.json();
          setMidiUrl(previewData.url);
        }
      } catch (e) {
        console.error("[Ludilo] Error loading song:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [songId, token]);

  if (loading) {
    return (
      <main className="min-h-screen pt-20 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-20 px-4 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <MusicalNoteIcon className="w-6 h-6 text-accent" />
            <h1 className="font-display font-bold text-xl text-gray-900 dark:text-white">
              {song?.title || "Song"}
            </h1>
          </div>

          {/* View selector */}
          <div className="flex rounded-xl bg-gray-100 dark:bg-surface-dark-card p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === v
                    ? "bg-white dark:bg-surface-dark-elevated text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t(`song.view_${v}`)}
              </button>
            ))}
          </div>
        </motion.div>

        {/* View content */}
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="card-solid p-6 min-h-[500px]"
        >
          {view === "pianoroll" && <PianoRollView midiUrl={midiUrl} />}
          {view === "score" && <ScoreView midiUrl={midiUrl} musicXmlUrl={musicXmlUrl} />}
          {view === "tab" && <TabView midiUrl={midiUrl} />}
        </motion.div>
      </div>
    </main>
  );
}
