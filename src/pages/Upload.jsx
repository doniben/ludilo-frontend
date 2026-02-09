import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpTrayIcon, MusicalNoteIcon, CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { getFingerprint } from "../utils/fingerprint";

const ALLOWED = ["mp3", "wav", "m4a", "flac", "ogg"];
const API = import.meta.env.VITE_API_URL;

export default function Upload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [libraryMatch, setLibraryMatch] = useState(null);
  const [checking, setChecking] = useState(false);

  const token = localStorage.getItem("ludilo-token");
  if (!token) { navigate("/login"); return null; }

  const handleFile = (f) => {
    const ext = f.name.split(".").pop().toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(t("upload.invalid_format", { formats: ALLOWED.join(", ") }));
      return;
    }
    setError("");
    setFile(f);
    setLibraryMatch(null);
    checkLibrary(f.name);
  };

  const checkLibrary = async (filename) => {
    setChecking(true);
    try {
      // 1. Intentar fingerprint (AcoustID)
      const { fingerprint, duration } = await getFingerprint(file);
      const identifyRes = await fetch(`${API}/library/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, duration }),
      });
      const identifyData = await identifyRes.json();
      if (identifyData.match && identifyData.libraryMatch) {
        setLibraryMatch({ ...identifyData.libraryMatch, acoustidTitle: identifyData.title, acoustidArtist: identifyData.artist, score: identifyData.score });
        return;
      }
      // 2. Fallback: buscar por nombre de archivo
      const title = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
      if (title.length < 2) return;
      const res = await fetch(`${API}/library/search?q=${encodeURIComponent(title)}&pageSize=3`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setLibraryMatch(data.results[0]);
      }
    } catch { /* fingerprint puede fallar en algunos formatos, no es crítico */ }
    finally { setChecking(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError("");

    try {
      // 1. Get SAS upload URL
      const res = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, fileSize: file.size, title: file.name.replace(/\.[^.]+$/, "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setProgress(20);

      // 2. Upload to Blob Storage via SAS URL
      const uploadRes = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("UPLOAD_FAILED");

      setProgress(70);

      // 3. Trigger processing
      const processRes = await fetch(`${import.meta.env.VITE_API_URL}/songs/${data.songId}/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const processData = await processRes.json();
      if (!processRes.ok) throw new Error(processData.error);

      setProgress(100);
      setTimeout(() => navigate("/dashboard"), 500);
    } catch (err) {
      const code = err.name === "TypeError" ? "NETWORK_ERROR" : err.message;
      setError(t(`errors.${code}`, t("errors.UNKNOWN")));
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen pt-20 px-4">
      <div className="max-w-xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display font-bold text-2xl text-gray-900 dark:text-white mb-6">
            {t("nav.upload")}
          </h1>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`card-solid p-12 text-center cursor-pointer border-dashed border-2 transition-all ${
              dragging ? "border-accent bg-accent-soft" : "border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED.map((e) => `.${e}`).join(",")}
              className="hidden"
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
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
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-ludilo-700 to-ludilo-500 dark:from-neon-cyan dark:to-ludilo-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                {progress < 20 && t("upload.preparing")}
                {progress >= 20 && progress < 70 && t("upload.uploading")}
                {progress >= 70 && progress < 100 && t("upload.processing")}
                {progress === 100 && t("upload.done")}
              </p>
            </div>
          )}

          {/* Library match */}
          <AnimatePresence>
            {libraryMatch && !uploading && (
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
                      {libraryMatch.artist} — {libraryMatch.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("library.match_confirm")}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => navigate("/dashboard")}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        {t("library.match_yes")}
                      </button>
                      <button
                        onClick={() => setLibraryMatch(null)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                      >
                        {t("library.match_no")}
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setLibraryMatch(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Checking library */}
          {checking && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
              <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
              {t("upload.preparing")}
            </p>
          )}

          {/* Submit */}
          {file && !uploading && (
            <button onClick={handleSubmit} className="btn-primary w-full mt-6 py-3">
              {t("nav.upload")}
            </button>
          )}
        </motion.div>
      </div>
    </main>
  );
}
