import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FireIcon, MusicalNoteIcon, TrophyIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";

const ALLOWED = ["mp3", "wav", "m4a", "flac", "ogg"];

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
            <button onClick={handleUpload} className="btn-primary w-full mt-4 py-3">{t("nav.upload")}</button>
          )}
        </motion.div>

        {/* Songs list */}
        {songs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-8">
            <h2 className="font-display font-semibold text-lg text-gray-900 dark:text-white mb-4">{t("dashboard.my_songs")}</h2>
            <div className="space-y-3">
              {songs.map((song) => (
                <div key={song.id} className="card-solid p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MusicalNoteIcon className="w-5 h-5 text-accent" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{song.title}</p>
                      <p className="text-xs text-gray-500">{song.format.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-mono px-2 py-1 rounded ${
                    song.status === "done" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                    song.status === "queued" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                    song.status === "processing" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    "bg-gray-100 dark:bg-white/5 text-gray-500"
                  }`}>
                    {t(`dashboard.status_${song.status}`, song.status)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
