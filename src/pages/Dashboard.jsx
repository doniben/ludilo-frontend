import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FireIcon, MusicalNoteIcon, TrophyIcon, ArrowUpTrayIcon, CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import MidiPreview from "../components/MidiPreview";

const ALLOWED = ["mp3", "wav", "m4a", "flac", "ogg"];
const API = import.meta.env.VITE_API_URL;

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [user, setUser] = useState(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [libraryMatch, setLibraryMatch] = useState(null);
  const [checking, setChecking] = useState(false);

  const token = localStorage.getItem("ludilo-token");
  const [songs, setSongs] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem("ludilo-user");
    if (!stored) { navigate("/login"); return; }
    setUser(JSON.parse(stored));
    fetchSongs();
  }, [navigate]);

  const fetchSongs = async () => {
    const t = localStorage.getItem("ludilo-token");
    if (!t) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/songs`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSongs(data.songs || []);
      }
    } catch {}
  };

  // Poll every 10s while songs are processing/queued
  useEffect(() => {
    const hasActive = songs.some(s => s.status === "queued" || s.status === "processing" || (s.status && !["done", "error"].includes(s.status)));
    if (!hasActive) return;
    const interval = setInterval(fetchSongs, 10000);
    return () => clearInterval(interval);
  }, [songs]);

  const handleLogout = () => {
    localStorage.removeItem("ludilo-token");
    localStorage.removeItem("ludilo-user");
    window.dispatchEvent(new Event("ludilo-auth"));
    navigate("/");
  };

  const handleFile = (f) => {
    const ext = f.name.split(".").pop().toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(t("upload.invalid_format", { formats: ALLOWED.join(", ") }));
      return;
    }
    setError("");
    setFile(f);
    setLibraryMatch(null);
    checkLibrary(f);
  };

  const checkLibrary = async (audioFile) => {
    setChecking(true);
    try {
      // Clean filename: remove extension, track numbers, separators, YouTube suffixes
      let title = audioFile.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
      title = title.replace(/^\d+[\s.\-_]+/, "").trim();
      title = title.replace(/\s*\(.*?(official|video|audio|lyric|hd|hq|live).*?\)\s*/gi, " ").trim();
      title = title.replace(/\s*\[.*?\]\s*/g, " ").trim();
      title = title.replace(/\s{2,}/g, " ").trim();
      console.log("[Ludilo] Búsqueda por nombre:", title);
      if (title.length >= 2) {
        const res = await fetch(`${API}/library/search?q=${encodeURIComponent(title)}&pageSize=3`);
        const data = await res.json();
        console.log("[Ludilo] Búsqueda:", data.total, "resultados");
        if (data.results && data.results.length > 0) setLibraryMatch(data.results[0]);
      }
    } catch {}
    finally { setChecking(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError("");

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, fileSize: file.size, title: file.name.replace(/\.[^.]+$/, "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProgress(20);

      const uploadRes = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("UPLOAD_FAILED");
      setProgress(50);

      // Try server-side AcoustID only if name search didn't find anything
      if (!libraryMatch) {
        console.log("[Ludilo] Identificando con fpcalc en servidor...");
        const identifyRes = await fetch(`${API}/library/identify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobPath: data.blobPath }),
        });
        const identifyData = await identifyRes.json();
        console.log("[Ludilo] Server identify:", identifyData);

        if (identifyData.match && identifyData.libraryMatch) {
          setUploading(false);
          setProgress(0);
          setLibraryMatch({
            ...identifyData.libraryMatch,
            acoustidTitle: identifyData.title,
            acoustidArtist: identifyData.artist,
            score: identifyData.score,
            _songId: data.songId,
          });
          return;
        }
      }

      setProgress(70);

      const processRes = await fetch(`${import.meta.env.VITE_API_URL}/songs/${data.songId}/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error);
      setProgress(100);

      setTimeout(() => { setFile(null); setUploading(false); setProgress(0); fetchSongs(); }, 1500);
    } catch (err) {
      const code = err.name === "TypeError" ? "NETWORK_ERROR" : err.message;
      setError(t(`errors.${code}`, t("errors.UNKNOWN")));
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen pt-20 px-4 pb-12">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-gray-900 dark:text-white">{user.username}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${user.plan === "premium" ? "bg-accent-soft text-accent" : "bg-gray-100 dark:bg-white/5 text-gray-500"}`}>{user.plan}</span>
              <span className="ml-2">{user.email}</span>
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Logout</button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><FireIcon className="w-5 h-5 text-orange-500" /></div>
            <div><p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p><p className="text-xs text-gray-500 dark:text-gray-400">Racha</p></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center"><MusicalNoteIcon className="w-5 h-5 text-accent" /></div>
            <div><p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p><p className="text-xs text-gray-500 dark:text-gray-400">Canciones</p></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card-solid p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-neon-violet/10 flex items-center justify-center"><TrophyIcon className="w-5 h-5 text-neon-violet" /></div>
            <div><p className="text-2xl font-display font-bold text-gray-900 dark:text-white">0</p><p className="text-xs text-gray-500 dark:text-gray-400">Dominadas</p></div>
          </motion.div>
        </div>

        {/* Upload zone */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            className={`card-solid p-8 text-center cursor-pointer border-dashed border-2 transition-all ${
              dragging ? "border-accent bg-accent-soft" : "border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20"
            }`}
          >
            <input ref={fileRef} type="file" accept={ALLOWED.map((e) => `.${e}`).join(",")} className="hidden" onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <MusicalNoteIcon className="w-8 h-8 text-accent" />
                <div className="text-left">
                  <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
              </div>
            ) : (
              <>
                <ArrowUpTrayIcon className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 text-sm">{t("upload.drop_here")}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{ALLOWED.join(", ")}</p>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}

          {uploading && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-ludilo-700 to-ludilo-500 dark:from-neon-cyan dark:to-ludilo-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                {progress < 20 && t("upload.preparing")}
                {progress >= 20 && progress < 70 && t("upload.uploading")}
                {progress >= 70 && progress < 100 && t("upload.processing")}
                {progress === 100 && t("upload.done")}
              </p>
            </div>
          )}

          {file && !uploading && (
            <>
              <AnimatePresence>
                {libraryMatch && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-4 p-4 rounded-xl bg-ludilo-50 dark:bg-neon-cyan/5 border border-ludilo-200 dark:border-neon-cyan/20"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircleIcon className="w-6 h-6 text-ludilo-600 dark:text-neon-cyan flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{t("library.match_found")}</p>
                        <p className="text-ludilo-700 dark:text-neon-cyan font-medium mt-1">
                          {libraryMatch.acoustidArtist || libraryMatch.artist} — {libraryMatch.acoustidTitle || libraryMatch.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("library.match_confirm")}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <MidiPreview blobPath={libraryMatch.blobPath} title={libraryMatch.acoustidTitle || libraryMatch.title} />
                          <button onClick={async () => {
                          try {
                            const res = await fetch(`${API}/library/use`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ blobPath: libraryMatch.blobPath, title: libraryMatch.acoustidTitle || libraryMatch.title, artist: libraryMatch.acoustidArtist || libraryMatch.artist, source: libraryMatch.source, format: libraryMatch.format }),
                            });
                            if (res.ok) {
                              // Delete the orphan uploading song if it exists
                              if (libraryMatch._songId) {
                                await fetch(`${API}/songs/${libraryMatch._songId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                              }
                              setFile(null); setLibraryMatch(null); fetchSongs();
                            }
                          } catch {}
                        }} className="btn-primary text-xs px-3 py-1.5">{t("library.match_yes")}</button>
                          <button onClick={async () => {
                            if (libraryMatch._songId) {
                              // Post-upload: enqueue for processing
                              await fetch(`${API}/songs/${libraryMatch._songId}/process`, {
                                method: "POST", headers: { Authorization: `Bearer ${token}` },
                              });
                              setFile(null); setLibraryMatch(null); fetchSongs();
                            } else {
                              setLibraryMatch(null);
                            }
                          }} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t("library.match_no")}</button>
                          <button onClick={() => navigate(`/library?q=${encodeURIComponent(libraryMatch.acoustidTitle || libraryMatch.title)}`)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">{t("library.more_options")}</button>
                        </div>
                      </div>
                      <button onClick={() => setLibraryMatch(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {checking && (
                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
                  <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
                  {t("upload.preparing")}
                </p>
              )}
              <button onClick={handleUpload} className="btn-primary w-full mt-4 py-3">{t("nav.upload")}</button>
            </>
          )}
        </motion.div>

        {/* Songs list */}
        {songs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8">
            <h2 className="font-display font-semibold text-lg text-gray-900 dark:text-white mb-4">{t("dashboard.my_songs")}</h2>
            <div className="space-y-3">
              {songs.map((song) => (
                <div key={song.id} onClick={() => song.status === "done" && navigate(`/song/${song.id}`)} className={`card-solid p-4 flex items-center justify-between ${song.status === "done" ? "cursor-pointer hover:border-ludilo-300 dark:hover:border-neon-cyan/20" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{song.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        song.status === "done" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                        song.status === "queued" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                        song.status === "error" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                        "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      }`}>
                        {!["done", "error", "queued"].includes(song.status) && (
                          <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin mr-1.5 align-middle" />
                        )}
                        {song.status === "queued" && song.position ? `#${song.position} · ` : ""}
                        {t(`dashboard.status_${song.status}`, song.status)}
                      </span>
                      {song.progress > 0 && song.progress < 100 && (
                        <div className="flex items-center gap-1.5 flex-1 max-w-[120px]">
                          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-ludilo-500 dark:bg-neon-cyan rounded-full transition-all duration-500" style={{ width: `${song.progress}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-400">{song.progress}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {song.status === "done" && <MidiPreview blobPath={song.originalBlobPath} title={song.title} source={song.stems ? "ludilo" : ""} stems={song.stems} />}
                    {song.status === "done" && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 hidden group-hover:inline" title="Puede tardar un momento mientras se descargan las pistas">Ver</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
