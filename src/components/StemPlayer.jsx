import { useState, useRef, useEffect, useCallback } from "react";
import { PlayIcon, PauseIcon, StopIcon, ArrowPathIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/solid";

const API = import.meta.env.VITE_API_URL;

const STEM_LABELS = {
  vocals: "Vocals",
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  piano: "Piano",
  other: "Other",
};

const STEM_COLORS = {
  vocals: "#06ffd2",
  drums: "#fbbf24",
  bass: "#8b5cf6",
  guitar: "#ff06c4",
  piano: "#3b82f6",
  other: "#6b7280",
};

export default function StemPlayer({ stems, songId, onTimeUpdate, activeStem, onStemChange, onPlayStateChange, onDurationKnown }) {
  const audioCtxRef = useRef(null);
  const sourcesRef = useRef({});
  const gainNodesRef = useRef({});
  const buffersRef = useRef({});
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumes, setVolumes] = useState({});
  const [soloStem, setSoloStem] = useState(null);
  const [showMixer, setShowMixer] = useState(false);
  const [speed, setSpeed] = useState(100);
  const animRef = useRef(null);

  // Load all stems
  useEffect(() => {
    if (!stems || Object.keys(stems).length === 0) return;

    const load = async () => {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const stemEntries = Object.entries(stems);
      const cache = await caches.open("ludilo-stems");

      for (const [name, blobPath] of stemEntries) {
        try {
          // Get SAS URL from API
          const res = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(blobPath)}`);
          const data = await res.json();
          if (!data.url) continue;

          // Check cache first
          const cacheKey = `stem-${songId}-${name}`;
          let arrayBuf;
          const cached = await cache.match(cacheKey);
          if (cached) {
            arrayBuf = await cached.arrayBuffer();
            console.log(`[Ludilo] Stem ${name}: cache hit`);
          } else {
            console.log(`[Ludilo] Stem ${name}: downloading...`);
            const audioRes = await fetch(data.url);
            const blob = await audioRes.blob();
            await cache.put(cacheKey, new Response(blob));
            arrayBuf = await blob.arrayBuffer();
          }

          const buffer = await ctx.decodeAudioData(arrayBuf);
          buffersRef.current[name] = buffer;

          // Create gain node
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gainNodesRef.current[name] = gain;

          if (buffer.duration > duration) {
            setDuration(buffer.duration);
          }
          setLoadedCount(prev => prev + 1);
        } catch (e) {
          console.error(`[Ludilo] StemPlayer: error loading ${name}:`, e);
        }
      }
      setReady(true);
      setLoading(false);
      // Initialize fake seqRef for viewer sync
      if (onTimeUpdate) onTimeUpdate(0);
      if (onPlayStateChange) onPlayStateChange(false);
      if (onDurationKnown) onDurationKnown(Object.values(buffersRef.current)[0]?.duration || 0);
    };

    load();
    return () => {
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, [stems]);

  // Time update loop
  useEffect(() => {
    const tick = () => {
      if (playing && audioCtxRef.current) {
        const t = audioCtxRef.current.currentTime - startTimeRef.current + offsetRef.current;
        setCurrentTime(t);
        if (onTimeUpdate) onTimeUpdate(t);
        if (t >= duration) {
          stop();
          return;
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, duration]);

  const startSources = useCallback((offset = 0) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Stop existing sources
    Object.values(sourcesRef.current).forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = {};

    // Create new sources from offset
    for (const [name, buffer] of Object.entries(buffersRef.current)) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed / 100;
      source.connect(gainNodesRef.current[name]);
      source.start(0, offset);
      sourcesRef.current[name] = source;
    }

    startTimeRef.current = ctx.currentTime;
    offsetRef.current = offset;
  }, [speed]);

  const play = useCallback(async () => {
    if (!ready) return;
    if (playing) {
      // Pause
      Object.values(sourcesRef.current).forEach(s => { try { s.stop(); } catch {} });
      offsetRef.current = currentTime;
      setPlaying(false);
      if (onPlayStateChange) onPlayStateChange(false);
      return;
    }
    await audioCtxRef.current?.resume();
    startSources(offsetRef.current);
    setPlaying(true);
    if (onPlayStateChange) onPlayStateChange(true);
  }, [playing, ready, currentTime, startSources]);

  const stop = useCallback(() => {
    Object.values(sourcesRef.current).forEach(s => { try { s.stop(); } catch {} });
    sourcesRef.current = {};
    offsetRef.current = 0;
    setCurrentTime(0);
    setPlaying(false);
    if (onTimeUpdate) onTimeUpdate(0);
    if (onPlayStateChange) onPlayStateChange(false);
  }, []);

  const seek = useCallback((time) => {
    offsetRef.current = time;
    setCurrentTime(time);
    if (playing) {
      startSources(time);
    }
    if (onTimeUpdate) onTimeUpdate(time);
  }, [playing, startSources]);

  // Volume/mute/solo
  useEffect(() => {
    for (const [name, gain] of Object.entries(gainNodesRef.current)) {
      const vol = volumes[name] ?? 100;
      const muted = soloStem && soloStem !== name;
      gain.gain.value = muted ? 0 : vol / 100;
    }
  }, [volumes, soloStem]);

  // Speed change
  useEffect(() => {
    Object.values(sourcesRef.current).forEach(s => {
      s.playbackRate.value = speed / 100;
    });
  }, [speed]);

  // Spacebar
  useEffect(() => {
    const handler = (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") {
        e.preventDefault();
        play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [play]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!stems || Object.keys(stems).length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
          <span>Cargando pistas... {loadedCount}/{Object.keys(stems).length}</span>
        </div>
      )}
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={play} disabled={!ready} className="px-3 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors disabled:opacity-40">
          {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>
        <button onClick={stop} disabled={!ready} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40">
          <StopIcon className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-10">{formatTime(currentTime)}</span>
          <input
            type="range" min="0" max={duration || 1} step="0.1" value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 h-1 accent-ludilo-500 dark:accent-neon-cyan"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-10">{formatTime(duration)}</span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{speed}%</span>
          <input type="range" min="25" max="150" step="5" value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-16 h-1 accent-ludilo-500 dark:accent-neon-cyan" />
        </div>

        {!ready && <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />}

        {/* Instrument selector */}
        <select value={activeStem || "guitar"} onChange={(e) => onStemChange?.(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50">
          {Object.keys(stems).map(name => (
            <option key={name} value={name}>{STEM_LABELS[name] || name}</option>
          ))}
        </select>

        {/* Mixer toggle */}
        <button onClick={() => setShowMixer(!showMixer)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${showMixer ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
          <AdjustmentsHorizontalIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Stem mixer (collapsible) */}
      {showMixer && (
      <div className="flex flex-wrap gap-1">
        {Object.entries(stems).map(([name]) => {
          const vol = volumes[name] ?? 100;
          const isSolo = soloStem === name;
          const isMuted = soloStem && soloStem !== name;
          const color = STEM_COLORS[name] || "#888";

          return (
            <div key={name} className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-gray-50 dark:bg-white/5">
              {/* Solo button */}
              <button
                onClick={() => setSoloStem(isSolo ? null : name)}
                className={`text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold ${isSolo ? "text-white" : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400"}`}
                style={isSolo ? { backgroundColor: color } : {}}
              >
                S
              </button>
              {/* Mute button */}
              <button
                onClick={() => setVolumes(v => ({ ...v, [name]: vol > 0 ? 0 : 100 }))}
                className={`text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold ${vol === 0 || isMuted ? "bg-red-500/20 text-red-500" : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400"}`}
              >
                M
              </button>
              {/* Label */}
              <span className="text-xs w-14 truncate" style={{ color }}>{STEM_LABELS[name] || name}</span>
              {/* Volume */}
              <input type="range" min="0" max="100" value={vol}
                onChange={(e) => setVolumes(v => ({ ...v, [name]: Number(e.target.value) }))}
                className="w-14 h-1" style={{ accentColor: color }} />
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
