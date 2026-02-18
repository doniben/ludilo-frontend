import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";

export default function AlphaTabView({ fileUrl, view = "tab" }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const synthsRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [activeTrack, setActiveTrack] = useState(0);

  const stopPlayback = () => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    synthsRef.current.forEach((s) => s.dispose());
    synthsRef.current = [];
    setPlaying(false);
  };

  const startPlayback = async () => {
    if (playing) { stopPlayback(); return; }
    if (!apiRef.current?.score) return;

    await Tone.start();
    const transport = Tone.getTransport();
    transport.cancel();

    const score = apiRef.current.score;
    const track = score.tracks[activeTrack];
    const synth = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 16 }).toDestination();
    synthsRef.current = [synth];

    const tempo = score.tempo;
    transport.bpm.value = tempo;

    // Schedule notes from the active track
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            const time = beat.absolutePlaybackStart / 960; // ticks to beats
            const duration = beat.playbackDuration / 960;
            for (const note of beat.notes) {
              if (!note.isTieDestination) {
                const midiNote = note.realValue;
                transport.schedule((t) => {
                  synth.triggerAttackRelease(
                    Tone.Frequency(midiNote, "midi").toNote(),
                    duration * (60 / tempo),
                    t,
                    note.dynamics / 16
                  );
                }, time * (60 / tempo));
              }
            }
          }
        }
      }
    }

    transport.start();
    setPlaying(true);
  };

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return;

    const timeout = setTimeout(async () => {
      const alphaTab = await import("@coderline/alphatab");

      // Get actual pixel width
      const width = wrapperRef.current?.clientWidth || 800;

      const settings = new alphaTab.Settings();
      settings.core.fontDirectory = "/font/";
      settings.core.file = fileUrl;
      settings.core.enableLazyLoading = false;
      settings.core.useWorkers = false;
      settings.player.enablePlayer = false;
      settings.player.enableCursor = false;
      settings.display.staveProfile = view === "score" ? 1 : view === "tab" ? 4 : 3;
      settings.display.layoutMode = 0;

      // Set explicit width
      containerRef.current.style.width = width + "px";

      const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
      apiRef.current = api;

      api.scoreLoaded.on((score) => {
        setTracks(score.tracks.map((t, i) => ({ index: i, name: t.name || `Track ${i + 1}` })));
        // Render only the first track
        api.renderTracks([score.tracks[0]]);
      });

      api.renderFinished.on(() => setLoading(false));
      api.playerStateChanged.on((e) => setPlaying(e.state === 1));
      api.error.on((e) => {
        console.error("[Ludilo] AlphaTab error:", e);
        setError("Error al cargar el archivo");
        setLoading(false);
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
      if (apiRef.current) {
        apiRef.current.destroy();
        apiRef.current = null;
      }
    };
  }, [fileUrl]);

  useEffect(() => {
    if (apiRef.current && apiRef.current.score) {
      apiRef.current.renderTracks([apiRef.current.score.tracks[activeTrack]]);
    }
    if (playing) stopPlayback();
  }, [activeTrack]);

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No hay archivo disponible</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={startPlayback}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors"
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={stopPlayback}
          className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
        >
          ⏹ Stop
        </button>

        {/* Track selector */}
        {tracks.length > 1 && (
          <select
            value={activeTrack}
            onChange={(e) => setActiveTrack(Number(e.target.value))}
            className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50"
          >
            {tracks.map((t) => (
              <option key={t.index} value={t.index}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* AlphaTab container */}
      <div ref={containerRef} className="dark:invert dark:hue-rotate-180" style={{ height: "600px", overflow: "auto" }} />
    </div>
  );
}
