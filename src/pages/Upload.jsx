import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpTrayIcon, MusicalNoteIcon } from "@heroicons/react/24/outline";

const ALLOWED = ["mp3", "wav", "m4a", "flac", "ogg"];

export default function Upload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

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
