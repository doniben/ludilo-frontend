import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { MusicalNoteIcon, PlusIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import AlphaTabView from "../components/AlphaTabView";
import ScoreView from "../components/ScoreView";
import PianoRollView from "../components/PianoRollView";
import TabView from "../components/TabView";
import MidiPlayer from "../components/MidiPlayer";
import StemPlayer from "../components/StemPlayer";

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
  const [midiTracks, setMidiTracks] = useState([]);
  const [activePart, setActivePart] = useState(-1); // -1 = all
  const [songStems, setSongStems] = useState(null);
  const [activeStem, setActiveStem] = useState("guitar");
  const [lyrics, setLyrics] = useState(null);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [midiMode, setMidiMode] = useState(false);
  const [toast, setToast] = useState(null);
  const midiSeqRef = useRef(null);
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
          // Check if song has stems (processed by worker)
          if (data.stems && typeof data.stems === "object" && Object.keys(data.stems).length > 0) {
            setSongStems(data.stems);
          }
          blobPath = Array.isArray(data.midiFiles) ? data.midiFiles[0] :
            (typeof data.midiFiles === "object" && data.midiFiles?.guitar) ? data.midiFiles.guitar :
            data.originalBlobPath;
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6 sticky top-0 z-10 bg-gray-50 dark:bg-surface-dark py-3 -mx-6 px-6">
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
            {/* Lyrics toggle */}
            <button
              disabled={!songId && !song?.id} onClick={async () => {
                if (lyrics) { setLyricsVisible(!lyricsVisible); return; }
                setLyricsLoading(true);
                try {
                  const token = localStorage.getItem("ludilo-token");
                  const res = await fetch(`${API}/songs/${songId || song?.id}/lyrics`, { headers: { Authorization: `Bearer ${token}` } });
                  const data = await res.json();
                  console.log("[Lyrics] got:", data.lyrics ? data.lyrics.length + " chars" : "null"); if (data.lyrics) { setLyrics(data.lyrics); setLyricsVisible(true); } else { setToast("No se encontró letra para esta canción"); setTimeout(() => setToast(null), 3000); }
                } catch {}
                setLyricsLoading(false);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                lyricsVisible ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
              }`}
            >
              {lyricsLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <span className="text-xs font-bold">Aa</span>
              )}
            </button>
            {/* MIDI/MP3 toggle (only for Ludilo songs with stems) */}
            {songStems && (
              <button
                onClick={() => setMidiMode(!midiMode)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${midiMode ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"}`}
              >
                {midiMode ? "MIDI" : "MP3"}
              </button>
            )}
          </div>
        </motion.div>

        <div className="card-solid p-6 min-h-[500px]">
          {isGP ? (
            <AlphaTabView fileUrl={fileUrl} view={view} />
          ) : (
            <>
              {songStems && !midiMode ? (
                <StemPlayer stems={songStems} songId={song?.id} activeStem={activeStem} onStemChange={async (s) => {
                  setActiveStem(s);
                  const midiFiles = song?.midiFiles;
                  if (midiFiles && midiFiles[s]) {
                    setMidiBlobPath(midiFiles[s]);
                    setMusicXmlUrl(null);
                    // Update fileUrl for TabView/PianoRollView
                    const res = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(midiFiles[s])}`);
                    const data = await res.json();
                    if (data.url) setFileUrl(data.url);
                  }
                }} onTimeUpdate={(t) => {
                  if (!midiSeqRef.current) {
                    midiSeqRef.current = { _time: 0, paused: true, duration: 0, playbackRate: 1 };
                    Object.defineProperty(midiSeqRef.current, 'currentTime', { get() { return this._time; }, set(v) { this._time = v; } });
                  }
                  midiSeqRef.current._time = t;
                }} onPlayStateChange={(playing) => {
                  if (midiSeqRef.current) midiSeqRef.current.paused = !playing;
                }} onDurationKnown={(d) => {
                  if (midiSeqRef.current) midiSeqRef.current.duration = d;
                }} />
              ) : (
                <MidiPlayer midiUrl={fileUrl} seqRef={midiSeqRef} onTracksLoaded={setMidiTracks} activePart={activePart} onPartChange={setActivePart} />
              )}
              {view === "pianoroll" && <PianoRollView midiUrl={fileUrl} seqRef={midiSeqRef} activePart={activePart} tracks={midiTracks} lyrics={lyricsVisible ? lyrics : null} />}
              {view === "score" && <ScoreView blobPath={midiBlobPath} musicXmlUrl={musicXmlUrl} onGenerated={setMusicXmlUrl} seqRef={midiSeqRef} activePart={activePart} chords={song?.chords} lyrics={lyricsVisible ? lyrics : null} />}
              {view === "tab" && <TabView midiUrl={fileUrl} seqRef={midiSeqRef} activePart={activePart} tracks={midiTracks} blobPath={midiBlobPath} musicXmlUrl={musicXmlUrl} onMusicXmlGenerated={setMusicXmlUrl} songTitle={song?.title} songArtist={song?.artist || song?.source} chords={song?.chords} lyrics={lyricsVisible ? lyrics : null} />}
            </>
          )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-gray-900/95 dark:bg-white/10 backdrop-blur-md border border-white/10 shadow-lg shadow-black/20 animate-fade-in">
          <p className="text-sm text-gray-200 dark:text-gray-300">{toast}</p>
        </div>
      )}
    </main>
  );
}
