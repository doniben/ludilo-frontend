import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MusicalNoteIcon, PlusIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import AlphaTabView from "../components/AlphaTabView";
import ScoreView from "../components/ScoreView";
import PianoRollView from "../components/PianoRollView";
import TabView from "../components/TabView";
import MidiPlayer from "../components/MidiPlayer";

const API = import.meta.env.VITE_API_URL;
const VIEWS = ["pianoroll", "score", "tab"];

export default function SongView({ isLibraryPreview }) {
  const { songId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [song, setSong] = useState(null);
  const [view, setView] = useState("tab");
  const [fileUrl, setFileUrl] = useState(null);
  const [isGP, setIsGP] = useState(false);
  const [midiBlobPath, setMidiBlobPath] = useState(null);
  const [musicXmlUrl, setMusicXmlUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const token = localStorage.getItem("ludilo-token");

  useEffect(() => {
    const load = async () => {
      try {
        let blobPath;
        if (isLibraryPreview) {
          blobPath = searchParams.get("blobPath");
          setSong({
            title: `${searchParams.get("artist") || ""} — ${searchParams.get("title") || ""}`.replace(/^\s*—\s*/, ""),
            blobPath,
            source: searchParams.get("source") || "",
            format: searchParams.get("format") || "",
          });
        } else {
          const res = await fetch(`${API}/songs/${songId}/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          setSong(data);
          blobPath = data.midiFiles?.[0] || data.originalBlobPath;
        }

        if (blobPath) {
          const gpExts = [".gp3", ".gp4", ".gp5", ".gpx", ".gp"];
          setIsGP(gpExts.some((ext) => blobPath.toLowerCase().endsWith(ext)));
          if (!gpExts.some((ext) => blobPath.toLowerCase().endsWith(ext))) {
            setMidiBlobPath(blobPath);
          }
          const previewRes = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(blobPath)}`);
          const previewData = await previewRes.json();
          setFileUrl(previewData.url);
        }
      } catch (e) {
        console.error("[Ludilo] Error loading song:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [songId, token, isLibraryPreview, searchParams]);

  const addToMySongs = async () => {
    if (!token || added) return;
    const res = await fetch(`${API}/library/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        blobPath: searchParams.get("blobPath"),
        title: searchParams.get("title") || "",
        artist: searchParams.get("artist") || "",
        source: searchParams.get("source") || "",
        format: searchParams.get("format") || "",
      }),
    });
    if (res.ok) setAdded(true);
  };

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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
              <ArrowLeftIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            <MusicalNoteIcon className="w-6 h-6 text-accent" />
            <h1 className="font-display font-bold text-xl text-gray-900 dark:text-white">
              {song?.title || "Song"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Add to my songs button (library preview only) */}
            {isLibraryPreview && token && (
              <button
                onClick={addToMySongs}
                disabled={added}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  added
                    ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20"
                }`}
              >
                <PlusIcon className="w-4 h-4" />
                {added ? t("song.added") : t("song.add_to_songs")}
              </button>
            )}

            {/* View selector */}
            <div className="flex rounded-xl bg-gray-100 dark:bg-surface-dark-card p-1">
              {(isGP ? ["tab", "score", "pianoroll"] : VIEWS).map((v) => (
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
          </div>
        </motion.div>

        <div className="card-solid p-6 min-h-[500px]">
          {isGP ? (
            <AlphaTabView fileUrl={fileUrl} view={view} />
          ) : (
            <>
              <MidiPlayer midiUrl={fileUrl} />
              {view === "pianoroll" && <PianoRollView midiUrl={fileUrl} />}
              {view === "score" && <ScoreView blobPath={midiBlobPath} musicXmlUrl={musicXmlUrl} onGenerated={setMusicXmlUrl} />}
              {view === "tab" && <TabView midiUrl={fileUrl} />}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
