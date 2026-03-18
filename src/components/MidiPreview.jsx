import { useState, useRef, useCallback, useEffect } from "react";
import { PlayIcon, StopIcon } from "@heroicons/react/24/solid";

const API = import.meta.env.VITE_API_URL;
const SF_URL = "https://stludilo.blob.core.windows.net/library/soundfonts/GeneralUser.sf3";

// Shared synth singleton
let sharedSynth = null;
let sharedSeq = null;
let sharedCtx = null;
let synthInitPromise = null;

async function getSharedSynth() {
  if (sharedSynth) return { synth: sharedSynth, seq: sharedSeq, ctx: sharedCtx };
  if (synthInitPromise) return synthInitPromise;

  synthInitPromise = (async () => {
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

    const seq = new Sequencer(synth);
    sharedSynth = synth;
    sharedSeq = seq;
    sharedCtx = ctx;
    return { synth, seq, ctx };
  })();
  return synthInitPromise;
}

export default function MidiPreview({ blobPath, title, source, stems }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(true); // always show for GP and MIDI
  const timerRef = useRef(null);

  const isGP = /\.(gp[345x]?|gp)$/i.test(blobPath || "");
  const isMidi = /\.(mid|midi)$/i.test(blobPath || "");
  const isLudilo = source === "ludilo" && stems;
  const audioRef = useRef(null);

  // For GP files, search for MIDI equivalent only if not a direct MIDI
  const [midiPath, setMidiPath] = useState(isMidi ? blobPath : null);

  useEffect(() => {
    if (isLudilo) { setReady(true); return; }
    if (isMidi) { setMidiPath(blobPath); return; }
    if (!isGP) { setReady(false); return; }
    // GP files: we'll parse them directly with alphaTab
    setMidiPath(null);
  }, [blobPath]);

  const stop = useCallback(() => {
    if (sharedSeq) sharedSeq.pause();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlaying(false);
  }, []);

  const play = useCallback(async (e) => {
    e.stopPropagation();
    if (playing) { stop(); return; }

    // Ludilo: play audio stem directly
    if (isLudilo) {
      setLoading(true);
      const audio = new Audio();
      audioRef.current = audio;
      try {
        const stemPath = stems.vocals || stems.guitar || Object.values(stems)[0];
        const res = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(stemPath)}`);
        const data = await res.json();
        if (data.url) {
          audio.src = data.url;
          await audio.play();
          setPlaying(true);
          timerRef.current = setTimeout(() => { audio.pause(); setPlaying(false); }, 15000);
          audio.onended = () => setPlaying(false);
        }
      } catch (err) { console.error("[Ludilo] Preview error:", err); }
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { synth, seq, ctx } = await getSharedSynth();
      await ctx.resume();

      // Get the file URL
      const previewRes = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(blobPath)}`);
      const { url } = await previewRes.json();
      const fileRes = await fetch(url);
      const arrayBuffer = await fileRes.arrayBuffer();

      let midiBytes;

      if (isGP) {
        // Parse GP with alphaTab and generate MIDI
        const alphaTab = await import("@coderline/alphatab");
        const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(arrayBuffer));
        const midiFile = new alphaTab.midi.MidiFile();
        const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile);
        handler.addNoteBend = () => {};
        const generator = new alphaTab.midi.MidiFileGenerator(score, null, handler);
        generator.generate();
        midiBytes = midiFile.toBinary();
      } else {
        // Already MIDI
        midiBytes = new Uint8Array(arrayBuffer);
      }

      seq.loadNewSongList([{ binary: midiBytes.buffer }]);
      await new Promise(r => setTimeout(r, 150));
      seq.play();
      setPlaying(true);

      // Auto-stop after 10s
      timerRef.current = setTimeout(() => stop(), 10000);
    } catch (err) {
      console.error("[Ludilo] Preview error:", err);
    } finally {
      setLoading(false);
    }
  }, [blobPath, playing, stop, isGP]);

  if (!isGP && !isMidi && !isLudilo) return null;

  return (
    <button
      onClick={play}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors"
    >
      {loading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : playing ? (
        <StopIcon className="w-3.5 h-3.5" />
      ) : (
        <PlayIcon className="w-3.5 h-3.5" />
      )}
      Preview
    </button>
  );
}
