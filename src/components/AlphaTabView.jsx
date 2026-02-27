import { useEffect, useRef, useState, useCallback } from "react";
import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";
import { PlayIcon, PauseIcon, StopIcon, ArrowPathIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/solid";

export default function AlphaTabView({ fileUrl, view = "tab" }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const atContainerRef = useRef(null);
  const apiRef = useRef(null);
  const synthRef = useRef(null);
  const seqRef = useRef(null);
  const ctxRef = useRef(null);
  const cursorRef = useRef(null);
  const animRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [activeTrack, setActiveTrack] = useState(0);
  const [volumes, setVolumes] = useState({});
  const [showMixer, setShowMixer] = useState(false);
  const [soundfont, setSoundfont] = useState("GeneralUser");
  const [speed, setSpeed] = useState(100);
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [sfLoading, setSfLoading] = useState(false);
  const [sfCached, setSfCached] = useState({ Sonivox: true, GeneralUser: true });

  const SOUNDFONTS = {
    Sonivox: { label: "Fast (1MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/sonivox.sf2" },
    GeneralUser: { label: "HQ (8MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/GeneralUser.sf3" },
    FluidR3: { label: "Studio (23MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/FluidR3Mono_GM.sf3" },
    Arachno: { label: "Pro (148MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/Arachno.sf2" },
    SGM: { label: "Ultra (235MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/SGM-V2.01.sf2" },
  };

  const changeSoundfont = async (sf) => {
    setSoundfont(sf);
    setSfLoading(true);
    try {
      const url = SOUNDFONTS[sf].path;
      const cache = await caches.open("ludilo-soundfonts");
      let res = await cache.match(url);
      if (!res) {
        res = await fetch(url);
        cache.put(url, res.clone());
      }
      const buf = await res.arrayBuffer();
      if (synthRef.current) {
        await synthRef.current.soundBankManager.addSoundBank(buf, "main");
        // Re-send program changes to restore instruments without restarting
        if (apiRef.current?.score) {
          for (const track of apiRef.current.score.tracks) {
            const ch = track.playbackInfo?.primaryChannel ?? 0;
            const program = track.playbackInfo?.program ?? 0;
            try { synthRef.current.programChange(ch, program); } catch {}
          }
        }
      }
      setSfCached((c) => ({ ...c, [sf]: true }));
    } catch (e) {
      console.error("[Ludilo] Soundfont load error:", e);
    }
    setSfLoading(false);
  };
  const [synthReady, setSynthReady] = useState(false);

  // Initialize SpessaSynth once
  useEffect(() => {
    const init = async () => {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/spessasynth_processor.min.js");
      const synth = new WorkletSynthesizer(ctx);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 2.0; // Boost volume
      synth.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Load soundfont
      // Load soundfont (with cache)
      const sfUrl = "https://stludilo.blob.core.windows.net/library/soundfonts/GeneralUser.sf3";
      const cache = await caches.open("ludilo-soundfonts");
      let sfResponse = await cache.match(sfUrl);
      if (!sfResponse) {
        sfResponse = await fetch(sfUrl);
        cache.put(sfUrl, sfResponse.clone());
      }
      const sfBuffer = await sfResponse.arrayBuffer();
      await synth.soundBankManager.addSoundBank(sfBuffer, "main");

      synthRef.current = synth;
      seqRef.current = new Sequencer(synth);
      setSynthReady(true);
    };
    init().catch((e) => console.error("[Ludilo] SpessaSynth init error:", e));

    return () => {
      seqRef.current?.stop();
      synthRef.current?.disconnect();
      ctxRef.current?.close();
    };
  }, []);

  const startPlayback = useCallback(async () => {
    if (!synthReady || !apiRef.current?.score) return;
    if (playing) { seqRef.current?.pause(); setPlaying(false); return; }

    await ctxRef.current.resume();
    // Generate MIDI from alphaTab score
    const alphaTab = await import("@coderline/alphatab");
    const score = apiRef.current.score;

    try {
      const midiFile = new alphaTab.midi.MidiFile();
      const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile);
      // Override addNoteBend to avoid MIDI 2.0 export error
      handler.addNoteBend = () => {};
      const generator = new alphaTab.midi.MidiFileGenerator(score, null, handler);
      generator.generate();
      const midiBytes = midiFile.toBinary();

      seqRef.current.loadNewSongList([{ binary: midiBytes.buffer }]);
      seqRef.current.play();
      setPlaying(true);

      // Start cursor animation
      const tickLookup = apiRef.current.renderer?.boundsLookup;
      if (tickLookup && cursorRef.current && view !== "pianoroll") {
        cursorRef.current.style.display = "block";
        if (containerRef.current) containerRef.current.scrollTop = 0;

        // Build cumulative time for each bar using actual time signatures
        const score = apiRef.current.score;
        const tempo = score.tempo;
        const allBars = tickLookup.staffSystems.flatMap(sg => sg.bars);
        const barTimesRef = [];
        let cumTime = 0;
        for (let i = 0; i < score.masterBars.length; i++) {
          barTimesRef.push(cumTime);
          const mb = score.masterBars[i];
          const beatsInBar = (mb.timeSignatureNumerator || 4);
          const beatValue = (mb.timeSignatureDenominator || 4);
          const secForBar = (60 / tempo) * beatsInBar * (4 / beatValue);
          cumTime += secForBar;
        }
        barTimesRef.push(cumTime);

        const animate = () => {
          if (!seqRef.current || seqRef.current.paused) return;
          const time = seqRef.current.currentTime + 0.25;

          // Find which bar we're in (barTimes are at 100% speed, scale by playback rate)
          const rate = seqRef.current.playbackRate || 1;
          let barIdx = 0;
          for (let i = 0; i < barTimesRef.length - 1; i++) {
            const scaledStart = barTimesRef[i] / rate;
            const scaledEnd = barTimesRef[i + 1] / rate;
            if (time >= scaledStart && time < scaledEnd) { barIdx = i; break; }
            if (i === barTimesRef.length - 2) barIdx = i;
          }

          if (barIdx < allBars.length && allBars[barIdx]) {
            const barStart = barTimesRef[barIdx] / rate;
            const barDuration = (barTimesRef[barIdx + 1] - barTimesRef[barIdx]) / rate;
            const barProgress = (time - barStart) / barDuration;
            const rb = allBars[barIdx].realBounds || allBars[barIdx].visualBounds;
            const x = rb.x + (rb.w * Math.min(barProgress, 1));
            const y = rb.y;
            const h = rb.h;
            cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
            cursorRef.current.style.height = `${h}px`;

            if (containerRef.current) {
              const scrollTop = containerRef.current.scrollTop;
              const viewHeight = containerRef.current.clientHeight;
              if (y < scrollTop || y + h > scrollTop + viewHeight) {
                containerRef.current.scrollTop = y - 20;
              }
            }
          }
          // Loop check
          if (loopStart !== null && loopEnd !== null && time >= loopEnd) {
            seqRef.current.currentTime = loopStart;
          }
          animRef.current = requestAnimationFrame(animate);
        };
        animRef.current = requestAnimationFrame(animate);
      }
    } catch (e) {
      console.error("[Ludilo] Playback error:", e.message);
    }
  }, [playing, synthReady]);

  const stopPlayback = useCallback(() => {
    if (seqRef.current) {
      seqRef.current.pause();
      seqRef.current.currentTime = 0;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (cursorRef.current) cursorRef.current.style.display = "none";
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !fileUrl) return;

    const timeout = setTimeout(async () => {
      const alphaTab = await import("@coderline/alphatab");
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

      atContainerRef.current.style.width = width + "px";

      const api = new alphaTab.AlphaTabApi(atContainerRef.current, settings);
      apiRef.current = api;

      api.scoreLoaded.on((score) => {
        setTracks(score.tracks.map((t, i) => ({ index: i, name: t.name || `Track ${i + 1}` })));
        api.renderTracks([score.tracks[0]]);
      });

      api.renderFinished.on(() => setLoading(false));
      api.error.on((e) => {
        console.error("[Ludilo] AlphaTab error:", e);
        setError("Error al cargar el archivo");
        setLoading(false);
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
      stopPlayback();
      if (apiRef.current) { apiRef.current.destroy(); apiRef.current = null; }
    };
  }, [fileUrl]);

  useEffect(() => {
    if (apiRef.current?.score) {
      apiRef.current.renderTracks([apiRef.current.score.tracks[activeTrack]]);
    }
    if (playing) stopPlayback();
  }, [activeTrack]);

  useEffect(() => {
    if (apiRef.current) {
      if (view === "pianoroll") {
        if (atContainerRef.current) atContainerRef.current.style.display = "none";
        if (cursorRef.current) cursorRef.current.style.display = "none";
        if (pianoRollRef.current) {
          pianoRollRef.current.style.display = "block";
          startPianoRoll();
        }
      } else {
        if (atContainerRef.current) atContainerRef.current.style.display = "";
        if (pianoRollRef.current) pianoRollRef.current.style.display = "none";
        if (pianoAnimRef.current) cancelAnimationFrame(pianoAnimRef.current);
        apiRef.current.settings.display.staveProfile = view === "score" ? 1 : 4;
        apiRef.current.updateSettings();
        apiRef.current.render();
      }
    }
  }, [view, activeTrack]);

  const pianoRollRef = useRef(null);
  const pianoAnimRef = useRef(null);
  const notesDataRef = useRef([]);

  const startPianoRoll = () => {
    if (!apiRef.current?.score || !pianoRollRef.current) return;
    const canvas = pianoRollRef.current;
    const score = apiRef.current.score;
    const track = score.tracks[activeTrack];
    const tempo = score.tempo;

    // Collect notes
    const notes = [];
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            const startSec = (beat.absolutePlaybackStart / 960) * (60 / tempo);
            const durSec = (beat.playbackDuration / 960) * (60 / tempo);
            for (const note of beat.notes) {
              if (!note.isTieDestination && note.realValue > 0) {
                notes.push({ midi: note.realValue, start: startSec, dur: durSec });
              }
            }
          }
        }
      }
    }
    notesDataRef.current = notes;

    // Animate
    const animate = () => {
      const ctx = canvas.getContext("2d");
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      canvas.width = w;
      canvas.height = h;

      const currentTime = seqRef.current?.currentTime || 0;
      const rate = seqRef.current?.playbackRate || 1;
      const windowSec = 4; // show 4 seconds of upcoming notes
      const pxPerSec = h / windowSec;

      // Background
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);

      // Piano keyboard at bottom
      const midiMin = 36; // C2
      const midiMax = 96; // C7
      const totalKeys = midiMax - midiMin;
      const keyW = w / totalKeys;

      // Subtle vertical guides
      ctx.strokeStyle = "rgba(6, 255, 210, 0.03)";
      for (let i = 0; i < totalKeys; i++) {
        ctx.beginPath();
        ctx.moveTo(i * keyW, 0);
        ctx.lineTo(i * keyW, h);
        ctx.stroke();
      }

      // Draw falling notes with glow
      const colors = ["#06ffd2", "#ff06c4", "#8b5cf6", "#fbbf24"];
      for (const note of notes) {
        if (note.midi < midiMin || note.midi >= midiMax) continue;
        const noteStart = note.start / rate;
        const noteDur = note.dur / rate;
        const relStart = noteStart - currentTime;
        const relEnd = relStart + noteDur;
        if (relEnd < 0 || relStart > windowSec) continue;

        const x = (note.midi - midiMin) * keyW;
        const yBottom = h - (relStart * pxPerSec);
        const yTop = h - (relEnd * pxPerSec);
        const noteHeight = yBottom - yTop;
        const isActive = relStart <= 0 && relEnd > 0;
        const color = colors[note.midi % 4];

        ctx.fillStyle = color;
        ctx.globalAlpha = isActive ? 1 : 0.75;
        ctx.shadowColor = isActive ? color : "transparent";
        ctx.shadowBlur = isActive ? 15 : 0;
        const rx = x + 1, ry = Math.max(0, yTop), rw = keyW - 2, rh = Math.min(noteHeight, h - ry);
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Hit line with glow
      ctx.strokeStyle = "#06ffd2";
      ctx.shadowColor = "#06ffd2";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      pianoAnimRef.current = requestAnimationFrame(animate);
    };
    if (pianoAnimRef.current) cancelAnimationFrame(pianoAnimRef.current);
    pianoAnimRef.current = requestAnimationFrame(animate);
  };

  if (!fileUrl) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">No hay archivo disponible</p></div>;
  if (error) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">{error}</p></div>;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="mb-4 space-y-3">
        {/* Transport controls */}
        <div className="flex items-center gap-3">
          <button onClick={startPlayback} className="px-3 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors">
            {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          </button>
          <button onClick={stopPlayback} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
            <StopIcon className="w-4 h-4" />
          </button>
          {/* Speed control */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{speed}%</span>
            <input
              type="range" min="25" max="150" step="5" value={speed}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSpeed(val);
                if (seqRef.current) seqRef.current.playbackRate = val / 100;
              }}
              className="w-20 h-1 accent-ludilo-500 dark:accent-neon-cyan"
            />
          </div>
          {/* Loop toggle */}
          <button
            onClick={() => {
              if (loopStart !== null) {
                setLoopStart(null); setLoopEnd(null);
                if (seqRef.current) seqRef.current.loopCount = 0;
              } else if (seqRef.current) {
                const time = seqRef.current.currentTime;
                setLoopStart(time);
                setLoopEnd(time + 10);
                seqRef.current.loopCount = Infinity;
              }
            }}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${loopStart !== null ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"}`}
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          {tracks.length > 1 && (
            <>
              <select value={activeTrack} onChange={(e) => setActiveTrack(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50">
                {tracks.map((t) => <option key={t.index} value={t.index}>{t.name}</option>)}
              </select>
              <button onClick={() => setShowMixer(!showMixer)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${showMixer ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
              </button>
              <select
                value={soundfont}
                onChange={(e) => changeSoundfont(e.target.value)}
                disabled={sfLoading}
                className="px-2 py-2 rounded-lg text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50"
              >
                {Object.entries(SOUNDFONTS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}{sfCached[key] && !["Sonivox","GeneralUser"].includes(key) ? " ✓" : ""}{sfLoading && soundfont === key ? " ⏳" : ""}
                  </option>
                ))}
              </select>
              {sfLoading && <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />}
            </>
          )}
        </div>

        {/* Mixer */}
        {showMixer && tracks.length > 1 && (
          <div className="flex flex-wrap gap-3">
            {tracks.map((t) => {
              const vol = volumes[t.index] ?? 100;
              const channel = apiRef.current?.score?.tracks[t.index]?.playbackInfo?.primaryChannel ?? t.index;
              return (
                <div key={t.index} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/5">
                  <button
                    onClick={() => {
                      const newVol = vol > 0 ? 0 : 100;
                      setVolumes((v) => ({ ...v, [t.index]: newVol }));
                      if (synthRef.current) synthRef.current.controllerChange(channel, 7, newVol);
                    }}
                    className={`text-xs w-5 h-5 rounded flex items-center justify-center font-bold ${vol === 0 ? "bg-red-500/20 text-red-500" : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400"}`}
                  >
                    {vol === 0 ? "M" : "♪"}
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-16 truncate">{t.name}</span>
                  <input
                    type="range"
                    min="0"
                    max="127"
                    value={vol > 0 ? Math.round(vol * 1.27) : 0}
                    onChange={(e) => {
                      const val = Math.round(Number(e.target.value) / 1.27);
                      setVolumes((v) => ({ ...v, [t.index]: val }));
                      if (synthRef.current) synthRef.current.controllerChange(channel, 7, Number(e.target.value));
                    }}
                    className="w-16 h-1 accent-ludilo-500 dark:accent-neon-cyan"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="relative" style={{ height: "calc(100vh - 220px)", overflow: "auto" }} ref={containerRef}>
        <div ref={cursorRef} className="absolute z-20 pointer-events-none bg-ludilo-700 dark:bg-[#06ffd2] dark:shadow-[0_0_8px_#06ffd2]" style={{ display: "none", width: "2px" }} />
        <div className="dark:invert dark:hue-rotate-180" ref={atContainerRef} />
        <canvas ref={pianoRollRef} className="block flex-1" style={{ display: "none" }} />
      </div>
    </div>
  );
}
