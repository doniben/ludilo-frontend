import { useEffect, useRef, useState, useCallback } from "react";
import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";

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
  const [synthReady, setSynthReady] = useState(false);

  // Initialize SpessaSynth once
  useEffect(() => {
    const init = async () => {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/spessasynth_processor.min.js");
      const synth = new WorkletSynthesizer(ctx);
      synth.connect(ctx.destination);

      // Load soundfont
      const sfResponse = await fetch("/soundfont/sonivox.sf2");
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
      // Mute all channels except the active track
      const trackChannels = score.tracks.map((t) => t.playbackInfo?.primaryChannel ?? -1);
      for (let ch = 0; ch < 16; ch++) {
        const isMuted = trackChannels[activeTrack] !== ch;
        synthRef.current.channelManager?.setChannelVolume(ch, isMuted ? 0 : 1);
      }
      seqRef.current.play();
      setPlaying(true);

      // Start cursor animation
      const tickLookup = apiRef.current.renderer?.boundsLookup;
      if (tickLookup && cursorRef.current) {
        cursorRef.current.style.display = "block";
        if (containerRef.current) containerRef.current.scrollTop = 0;

        // Build cumulative time for each bar using actual time signatures
        const score = apiRef.current.score;
        const tempo = score.tempo;
        const allBars = tickLookup.staffSystems.flatMap(sg => sg.bars);
        const barTimes = []; // start time of each bar in seconds
        let cumTime = 0;
        for (let i = 0; i < score.masterBars.length; i++) {
          barTimes.push(cumTime);
          const mb = score.masterBars[i];
          const beatsInBar = (mb.timeSignatureNumerator || 4);
          const beatValue = (mb.timeSignatureDenominator || 4);
          const secForBar = (60 / tempo) * beatsInBar * (4 / beatValue);
          cumTime += secForBar;
        }
        barTimes.push(cumTime); // end time

        const animate = () => {
          if (!seqRef.current || seqRef.current.paused) return;
          const time = seqRef.current.currentTime + 0.25;

          // Find which bar we're in
          let barIdx = 0;
          for (let i = 0; i < barTimes.length - 1; i++) {
            if (time >= barTimes[i] && time < barTimes[i + 1]) { barIdx = i; break; }
            if (i === barTimes.length - 2) barIdx = i;
          }

          if (barIdx < allBars.length && allBars[barIdx]) {
            const barDuration = barTimes[barIdx + 1] - barTimes[barIdx];
            const barProgress = (time - barTimes[barIdx]) / barDuration;
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

  if (!fileUrl) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">No hay archivo disponible</p></div>;
  if (error) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">{error}</p></div>;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={startPlayback} className="px-4 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors">
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button onClick={stopPlayback} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
          ⏹ Stop
        </button>
        {tracks.length > 1 && (
          <select value={activeTrack} onChange={(e) => setActiveTrack(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50">
            {tracks.map((t) => <option key={t.index} value={t.index}>{t.name}</option>)}
          </select>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="relative" style={{ height: "600px", overflow: "auto" }} ref={containerRef}>
        <div ref={cursorRef} className="absolute z-20 pointer-events-none" style={{ display: "none", width: "2px", backgroundColor: "#06ffd2", boxShadow: "0 0 8px #06ffd2" }} />
        <div className="dark:invert dark:hue-rotate-180" ref={atContainerRef} />
      </div>
    </div>
  );
}
