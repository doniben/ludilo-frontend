import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { FireIcon, MusicalNoteIcon, PlusIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import MidiPreview from "../components/MidiPreview";
import QualityBadge from "../components/QualityBadge";

const API = import.meta.env.VITE_API_URL;

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState(new Set());
  const token = localStorage.getItem("ludilo-token");

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, songsRes] = await Promise.all([
          fetch(`${API}/users/${userId}/profile`),
          fetch(`${API}/users/${userId}/songs`),
        ]);
        if (profileRes.ok) setProfile(await profileRes.json());
        if (songsRes.ok) {
          const data = await songsRes.json();
          setSongs(data.songs || []);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  const addToMySongs = async (song) => {
    if (!token || addedIds.has(song.id)) return;
    const blobPath = song.originalBlobPath || (Array.isArray(song.midiFiles) ? song.midiFiles[0] : Object.values(song.midiFiles || {})[0]);
    const res = await fetch(`${API}/library/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ blobPath, title: song.title, artist: "", source: "ludilo", format: song.format || "stems+midi", originalUserId: userId }),
    });
    if (res.ok) setAddedIds(new Set([...addedIds, song.id]));
  };

  if (loading) {
    return (
      <main className="min-h-screen pt-20 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen pt-20 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">User not found</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-20 px-4 pb-12">
      <div className="max-w-4xl mx-auto">
        {/* Profile header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-solid p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-ludilo-100 dark:bg-neon-cyan/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-ludilo-700 dark:text-neon-cyan">
                {profile.username?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
            <div className="flex-1">
              <h1 className="font-display font-bold text-xl text-gray-900 dark:text-white">{profile.username}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{profile.plan} plan</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="flex items-center gap-1 text-orange-500">
                  <FireIcon className="w-5 h-5" />
                  <span className="font-bold text-lg">{profile.streak}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("dashboard.streak")}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-ludilo-600 dark:text-neon-cyan">
                  <MusicalNoteIcon className="w-5 h-5" />
                  <span className="font-bold text-lg">{songs.length}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("profile.songs")}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Songs list */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="font-display font-semibold text-lg text-gray-900 dark:text-white mb-4">
            {t("profile.songs_of", { name: profile.username })}
          </h2>
          {songs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t("profile.no_songs")}</p>
          ) : (
            <div className="space-y-3">
              {songs.map((song) => (
                <div key={song.id} className="card-solid p-4 flex items-center justify-between hover:border-ludilo-300 dark:hover:border-neon-cyan/20 transition-colors">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/song/${song.id}`)}>
                    <div className="flex items-center gap-2">
                      <QualityBadge source={song.stems && Object.keys(song.stems).length > 0 ? "ludilo" : song.source === "library" ? (song.librarySource || "midi") : "midi"} />
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{song.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MidiPreview blobPath={song.originalBlobPath || (Array.isArray(song.midiFiles) ? song.midiFiles[0] : Object.values(song.midiFiles || {})[0])} title={song.title} source={song.stems && Object.keys(song.stems).length ? "ludilo" : ""} stems={song.stems} />
                    {token && song.stems && typeof song.stems === "object" && Object.keys(song.stems).length > 0 && (
                      <button
                        onClick={() => addToMySongs(song)}
                        disabled={addedIds.has(song.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          addedIds.has(song.id)
                            ? "text-green-500"
                            : "text-gray-400 hover:text-ludilo-600 dark:hover:text-neon-cyan hover:bg-gray-100 dark:hover:bg-white/5"
                        }`}
                        title={addedIds.has(song.id) ? t("song.added") : t("song.add_to_songs")}
                      >
                        {addedIds.has(song.id) ? <CheckCircleIcon className="w-5 h-5" /> : <PlusIcon className="w-5 h-5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
