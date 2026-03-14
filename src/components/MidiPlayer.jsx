import { useState, useRef, useCallback, useEffect } from "react";
import { PlayIcon, PauseIcon, StopIcon, ArrowPathIcon, AdjustmentsHorizontalIcon } from "@heroicons/react/24/solid";

const SOUNDFONTS = {
  Sonivox: { label: "Fast (1MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/sonivox.sf2" },
  GeneralUser: { label: "HQ (8MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/GeneralUser.sf3" },
  FluidR3: { label: "Studio (23MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/FluidR3Mono_GM.sf3" },
  Arachno: { label: "Pro (148MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/Arachno.sf2" },
  SGM: { label: "Ultra (235MB)", path: "https://stludilo.blob.core.windows.net/library/soundfonts/SGM-V2.01.sf2" },
};

export default function MidiPlayer({ midiUrl, seqRef: externalSeqRef, onTracksLoaded, activePart, onPartChange }) {
  const synthRef = useRef(null);
  const seqRef = useRef(null);
  const ctxRef = useRef(null);
  const loopAnimRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(100);
  const [tracks, setTracks] = useState([]);
  const [volumes, setVolumes] = useState({});
  const [showMixer, setShowMixer] = useState(false);
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [soundfont, setSoundfont] = useState("GeneralUser");
  const [sfLoading, setSfLoading] = useState(false);
  const [sfCached, setSfCached] = useState({ Sonivox: true, GeneralUser: true });

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
      const sfUrl = SOUNDFONTS.GeneralUser.path;
      let sfRes = await cache.match(sfUrl);
      if (!sfRes) { sfRes = await fetch(sfUrl); cache.put(sfUrl, sfRes.clone()); }
      const sfBuf = await sfRes.arrayBuffer();
      await synth.soundBankManager.addSoundBank(sfBuf, "main");
      await new Promise(r => setTimeout(r, 300));

      const midiRes = await fetch(midiUrl);
      const midiBuf = await midiRes.arrayBuffer();
      const seq = new Sequencer(synth);
      seq.loadNewSongList([{ binary: midiBuf }]);

      // Extract channels and instruments from raw MIDI
      const trackList = [];
      const usedChannels = new Set();
      const channelProgram = {};
      const bytes = new Uint8Array(midiBuf);
      for (let i = 0; i < bytes.length - 2; i++) {
        const b = bytes[i];
        if (b >= 0x90 && b <= 0x9F && bytes[i + 2] > 0) {
          usedChannels.add(b & 0x0F);
        }
        if (b >= 0xC0 && b <= 0xCF) {
          channelProgram[b & 0x0F] = bytes[i + 1];
        }
      }
      const GM_NAMES = ["Piano","Piano","E.Piano","Honky-tonk","E.Piano","E.Piano","Harpsichord","Clavinet","Celesta","Glockenspiel","Music Box","Vibraphone","Marimba","Xylophone","Tubular Bells","Dulcimer","Organ","Organ","Organ","Church Organ","Reed Organ","Accordion","Harmonica","Tango Accordion","Nylon Guitar","Steel Guitar","Jazz Guitar","Clean Guitar","Muted Guitar","Overdrive Guitar","Distortion Guitar","Harmonics","Acoustic Bass","Finger Bass","Pick Bass","Fretless Bass","Slap Bass","Slap Bass","Synth Bass","Synth Bass","Violin","Viola","Cello","Contrabass","Tremolo Strings","Pizzicato","Harp","Timpani","Strings","Strings","Synth Strings","Synth Strings","Choir Aahs","Voice Oohs","Synth Voice","Orchestra Hit","Trumpet","Trombone","Tuba","Muted Trumpet","French Horn","Brass","Synth Brass","Synth Brass","Soprano Sax","Alto Sax","Tenor Sax","Baritone Sax","Oboe","English Horn","Bassoon","Clarinet","Piccolo","Flute","Recorder","Pan Flute","Blown Bottle","Shakuhachi","Whistle","Ocarina","Square Lead","Sawtooth","Calliope","Chiff","Charang","Voice Lead","Fifths","Bass+Lead","New Age Pad","Warm Pad","Polysynth","Choir Pad","Bowed Pad","Metallic","Halo Pad","Sweep Pad","Rain","Soundtrack","Crystal","Atmosphere","Brightness","Goblins","Echoes","Sci-Fi","Sitar","Banjo","Shamisen","Koto","Kalimba","Bagpipe","Fiddle","Shanai","Tinkle Bell","Agogo","Steel Drums","Woodblock","Taiko","Melodic Tom","Synth Drum","Reverse Cymbal","Fret Noise","Breath","Seashore","Bird Tweet","Telephone","Helicopter","Applause","Gunshot"];
      [...usedChannels].sort((a, b) => a - b).forEach((ch) => {
        const prog = channelProgram[ch] ?? 0;
        const name = ch === 9 ? "Drums" : (GM_NAMES[prog] || `Ch ${ch + 1}`);
        trackList.push({ index: ch, channel: ch, name });
      });

      // Check which soundfonts are cached
      const cached = { Sonivox: true, GeneralUser: true };
      for (const [key, { path }] of Object.entries(SOUNDFONTS)) {
        if (await cache.match(path)) cached[key] = true;
      }

      if (!cancelled) {
        ctxRef.current = ctx;
        synthRef.current = synth;
        seqRef.current = seq;
        if (externalSeqRef) externalSeqRef.current = seq;
        setTracks(trackList);
        setSfCached(cached);
        if (onTracksLoaded) onTracksLoaded(trackList);
        setReady(true);
      }
    };

    init().catch(e => console.error("[Ludilo] MidiPlayer init error:", e));
    return () => { cancelled = true; };
  }, [midiUrl]);

  // Loop enforcement
  useEffect(() => {
    if (loopStart === null || loopEnd === null || !playing) {
      if (loopAnimRef.current) cancelAnimationFrame(loopAnimRef.current);
      return;
    }
    const check = () => {
      if (seqRef.current && seqRef.current.currentTime >= loopEnd) {
        seqRef.current.currentTime = loopStart;
      }
      loopAnimRef.current = requestAnimationFrame(check);
    };
    loopAnimRef.current = requestAnimationFrame(check);
    return () => { if (loopAnimRef.current) cancelAnimationFrame(loopAnimRef.current); };
  }, [loopStart, loopEnd, playing]);

  const play = useCallback(async () => {
    if (!ready) return;
    if (playing) { seqRef.current?.pause(); setPlaying(false); return; }
    await ctxRef.current?.resume();
    seqRef.current?.play();
    setPlaying(true);
  }, [playing, ready]);

  // Spacebar to play/pause
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

  const stop = useCallback(() => {
    if (seqRef.current) { seqRef.current.pause(); seqRef.current.currentTime = 0; }
    setPlaying(false);
  }, []);

  const changeSoundfont = async (sf) => {
    setSoundfont(sf);
    setSfLoading(true);
    try {
      const url = SOUNDFONTS[sf].path;
      const cache = await caches.open("ludilo-soundfonts");
      let res = await cache.match(url);
      if (!res) { res = await fetch(url); cache.put(url, res.clone()); }
      const buf = await res.arrayBuffer();
      if (synthRef.current) await synthRef.current.soundBankManager.addSoundBank(buf, "main");
      setSfCached(prev => ({ ...prev, [sf]: true }));
    } catch (e) { console.error("[Ludilo] Soundfont error:", e); }
    setSfLoading(false);
  };

  if (!midiUrl) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={play} disabled={!ready} className="px-3 py-2 rounded-lg text-sm font-medium bg-ludilo-100 dark:bg-neon-cyan/10 text-ludilo-700 dark:text-neon-cyan hover:bg-ludilo-200 dark:hover:bg-neon-cyan/20 transition-colors disabled:opacity-40">
          {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>
        <button onClick={stop} disabled={!ready} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40">
          <StopIcon className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{speed}%</span>
          <input type="range" min="25" max="150" step="5" value={speed}
            onChange={(e) => { const v = Number(e.target.value); setSpeed(v); if (seqRef.current) seqRef.current.playbackRate = v / 100; }}
            className="w-20 h-1 accent-ludilo-500 dark:accent-neon-cyan" />
        </div>
        {/* Loop */}
        <button
          onClick={() => {
            if (loopStart !== null) { setLoopStart(null); setLoopEnd(null); }
            else if (seqRef.current) { const t = seqRef.current.currentTime; setLoopStart(t); setLoopEnd(t + 10); }
          }}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${loopStart !== null ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"}`}
        >
          <ArrowPathIcon className="w-4 h-4" />
        </button>
        {tracks.length > 1 && (
          <>
            <select value={activePart ?? -1} onChange={(e) => onPartChange?.(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50">
              <option value={-1}>Todas</option>
              {tracks.map((t, i) => <option key={t.channel} value={i}>{t.name}</option>)}
            </select>
            <button onClick={() => setShowMixer(!showMixer)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${showMixer ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"}`}>
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
            </button>
          </>
        )}
        {/* Soundfont */}
        <select value={soundfont} onChange={(e) => changeSoundfont(e.target.value)} disabled={sfLoading}
          className="px-2 py-2 rounded-lg text-xs bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-0 focus:ring-2 focus:ring-ludilo-500/50">
          {Object.entries(SOUNDFONTS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}{sfCached[key] && !["Sonivox","GeneralUser"].includes(key) ? " \u2713" : ""}{sfLoading && soundfont === key ? " \u23F3" : ""}</option>
          ))}
        </select>
        {sfLoading && <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />}
        {!ready && <span className="w-3 h-3 border border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />}
      </div>

      {showMixer && tracks.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {tracks.map((t) => {
            const vol = volumes[t.index] ?? 100;
            return (
              <div key={t.index} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 dark:bg-white/5">
                <button
                  onClick={() => {
                    const newVol = vol > 0 ? 0 : 100;
                    setVolumes((v) => ({ ...v, [t.index]: newVol }));
                    if (synthRef.current) synthRef.current.controllerChange(t.channel, 7, newVol > 0 ? 127 : 0);
                  }}
                  className={`text-xs w-5 h-5 rounded flex items-center justify-center font-bold ${vol === 0 ? "bg-red-500/20 text-red-500" : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400"}`}
                >
                  {vol === 0 ? "M" : "\u266A"}
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16 truncate">{t.name}</span>
                <input type="range" min="0" max="127" value={vol > 0 ? Math.round(vol * 1.27) : 0}
                  onChange={(e) => {
                    const val = Math.round(Number(e.target.value) / 1.27);
                    setVolumes((v) => ({ ...v, [t.index]: val }));
                    if (synthRef.current) synthRef.current.controllerChange(t.channel, 7, Number(e.target.value));
                  }}
                  className="w-16 h-1 accent-ludilo-500 dark:accent-neon-cyan" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
