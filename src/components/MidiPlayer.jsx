import { useState, useRef, useCallback, useEffect } from "react";
import { PlayIcon, PauseIcon, StopIcon } from "@heroicons/react/24/solid";

const SF_URL = "https://stludilo.blob.core.windows.net/library/soundfonts/GeneralUser.sf3";

export default function MidiPlayer({ midiUrl }) {
  const synthRef = useRef(null);
  const seqRef = useRef(null);
  const ctxRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(100);

  // Initialize synth
  useEffect(() => {
    if (!midiUrl) return;
    let cancelled = false;

    const init = async () => {
      const { Sequencer, WorkletSynthesizer } = await import("spessasynth_lib");
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/spessasynth_processor.min.js");
      const synth = new WorkletSynthesizer(ctx);
      const gain = ctx.createGain();
      gain.gain.value = 2.0;
      synth.connect(gain);
      gain.connect(ctx.destination);

      const cache = await caches.open("ludilo-soundfonts");
      let sfRes = await cache.match(SF_URL);
      if (!sfRes) { sfRes = await fetch(SF_URL); cache.put(SF_URL, sfRes.clone()); }
      const sfBuf = await sfRes.arrayBuffer();
      await synth.soundBankManager.addSoundBank(sfBuf, "main");
      await new Promise(r => setTimeout(r, 300));

      // Load MIDI
      const midiRes = await fetch(midiUrl);
      const midiBuf = await midiRes.arrayBuffer();
      const seq = new Sequencer(synth);
      seq.loadNewSongList([{ binary: midiBuf }]);

      if (!cancelled) {
        ctxRef.current = ctx;
        synthRef.current = synth;
        seqRef.current = seq;
        setReady(true);
      }
    };

    init().catch(e => console.error("[Ludilo] MidiPlayer init error:", e));
    return () => { cancelled = true; };
  }, [midiUrl]);

  const play = useCallback(async () => {
    if (!ready) return;
    if (playing) { seqRef.current?.pause(); setPlaying(false); return; }
    await ctxRef.current?.resume();
    seqRef.current?.play();
    setPlaying(true);
  }, [playing, ready]);

  const stop = useCallback(() => {
    if (seqRef.current) {
      seqRef.current.pause();
      seqRef.current.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  if (!midiUrl) return null;

  return (
    <div className="flex items-center gap-3 mb-4">
      <button onClick={play} disabled={!ready} className="px-3 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors disabled:opacity-40">
        {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
      </button>
      <button onClick={stop} disabled={!ready} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40">
        <StopIcon className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">{speed}%</span>
        <input
          type="range" min="25" max="150" step="5" value={speed}
          onChange={(e) => { const v = Number(e.target.value); setSpeed(v); if (seqRef.current) seqRef.current.playbackRate = v / 100; }}
          className="w-20 h-1 accent-ludilo-500 dark:accent-neon-cyan"
        />
      </div>
      {!ready && <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />}
    </div>
  );
}
