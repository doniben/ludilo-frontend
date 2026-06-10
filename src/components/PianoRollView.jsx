import { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";

const MIDI_MIN = 36;
const MIDI_MAX = 96;

export default function PianoRollView({ midiUrl, seqRef, activePart = -1, tracks = [], lyrics }) {
  const canvasRef = useRef(null);
  const [currentLyric, setCurrentLyric] = useState("");
  const animRef = useRef(null);
  const notesRef = useRef([]);
  const activePartRef = useRef(activePart);
  const tracksRef = useRef(tracks);
  const [activeNotes, setActiveNotes] = useState(new Set());
  const [error, setError] = useState(null);

  activePartRef.current = activePart;
  tracksRef.current = tracks;

  useEffect(() => {
    if (!midiUrl || !canvasRef.current) return;

    const load = async () => {
      try {
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("No se pudo descargar");
        const buf = await res.arrayBuffer();
        const midi = new Midi(buf);

        const notes = [];
        for (const track of midi.tracks) {
          const ch = track.channel;
          for (const note of track.notes) {
            if (note.duration < 0.08) continue;
            const isDup = notes.some(n => Math.abs(n.start - note.time) < 0.1 && n.midi === note.midi);
            if (isDup) continue;
            notes.push({ midi: note.midi, start: note.time, dur: note.duration, channel: ch });
          }
        }
        notesRef.current = notes;
        startAnimation();
      } catch (e) {
        setError(e.message);
      }
    };

    const startAnimation = () => {
      const animate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const w = canvas.parentElement.clientWidth;
        const h = canvas.parentElement.clientHeight - 80; // leave room for keyboard
        canvas.width = w;
        canvas.height = h;

        const currentTime = seqRef?.current?.currentTime || 0;

        // Update current lyric
        if (lyrics) {
          const parsed = lyrics.split("\n").map(l => { const m = l.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/); return m ? { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3] } : null; }).filter(Boolean);
          let cur = "";
          for (const l of parsed) { if (l.time <= currentTime) cur = l.text; else break; }
          setCurrentLyric(cur);
        }
        const windowSec = 4;
        const pxPerSec = h / windowSec;
        const totalKeys = MIDI_MAX - MIDI_MIN;
        const keyW = w / totalKeys;

        const isDark = document.documentElement.classList.contains("dark");
        ctx.fillStyle = isDark ? "#0a0a0f" : "#f5f5f4";
        ctx.fillRect(0, 0, w, h);

        // Vertical guides
        ctx.strokeStyle = isDark ? "rgba(6, 255, 210, 0.03)" : "rgba(0, 0, 0, 0.04)";
        for (let i = 0; i < totalKeys; i++) {
          ctx.beginPath();
          ctx.moveTo(i * keyW, 0);
          ctx.lineTo(i * keyW, h);
          ctx.stroke();
        }

        const colors = ["#06ffd2", "#ff06c4", "#8b5cf6", "#fbbf24"];
        const active = new Set();
        const filterCh = activePartRef.current >= 0 && tracksRef.current[activePartRef.current] ? tracksRef.current[activePartRef.current].channel : -1;
        for (const note of notesRef.current) {
          if (filterCh >= 0 && note.channel !== filterCh) continue;
          if (note.midi < MIDI_MIN || note.midi >= MIDI_MAX) continue;
          const noteStart = note.start;
          const noteDur = note.dur;
          const relStart = noteStart - currentTime;
          const relEnd = relStart + noteDur;
          if (relEnd < 0 || relStart > windowSec) continue;

          const x = (note.midi - MIDI_MIN) * keyW;
          const yBottom = h - (relStart * pxPerSec);
          const yTop = h - (relEnd * pxPerSec);
          const noteHeight = yBottom - yTop;
          const isActive = relStart <= 0 && relEnd > 0;
          const color = colors[note.midi % 4];

          if (isActive) active.add(note.midi);

          ctx.fillStyle = color;
          ctx.globalAlpha = isActive ? 1 : 0.75;
          ctx.shadowColor = isActive ? color : "transparent";
          ctx.shadowBlur = isActive ? 15 : 0;
          ctx.beginPath();
          ctx.roundRect(x + 1, Math.max(0, yTop), keyW - 2, Math.min(noteHeight, h - Math.max(0, yTop)), 3);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Hit line
        ctx.strokeStyle = isDark ? "#06ffd2" : "#0f766e";
        ctx.shadowColor = isDark ? "#06ffd2" : "#0f766e";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(w, h);
        ctx.stroke();
        ctx.shadowBlur = 0;

        setActiveNotes(active);
        animRef.current = requestAnimationFrame(animate);
      };
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(animate);
    };

    load();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [midiUrl, seqRef]);

  if (!midiUrl) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">No hay MIDI disponible</p></div>;
  if (error) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">{error}</p></div>;

  const whiteKeys = [];
  const blackKeys = [];
  let whiteCount = 0;
  for (let midi = MIDI_MIN; midi < MIDI_MAX; midi++) {
    if (![1, 3, 6, 8, 10].includes(midi % 12)) { whiteKeys.push({ midi, index: whiteCount }); whiteCount++; }
  }
  const whiteW = 100 / whiteCount;
  let wIdx = 0;
  for (let midi = MIDI_MIN; midi < MIDI_MAX; midi++) {
    if (![1, 3, 6, 8, 10].includes(midi % 12)) { wIdx++; continue; }
    blackKeys.push({ midi, left: (wIdx - 0.35) * whiteW });
  }

  return (
    <div className="w-full" style={{ height: "calc(100vh - 280px)" }}>
      <div className="relative w-full h-full flex flex-col">
        <canvas ref={canvasRef} className="block flex-1" />
        {currentLyric && <div className="absolute top-3 left-0 right-0 z-10 text-center pointer-events-none"><span className="inline-block px-4 py-2 rounded-lg bg-black/80 text-lg font-medium text-purple-300">{currentLyric}</span></div>}
        <div className="flex h-20 relative select-none">
          {whiteKeys.map(({ midi }) => {
            const active = activeNotes.has(midi);
            return <div key={midi} className={`flex-1 border-r border-gray-300 rounded-b-sm transition-colors duration-75 ${active ? "bg-[#06ffd2] shadow-[0_0_12px_#06ffd2]" : "bg-white"}`} />;
          })}
          {blackKeys.map(({ midi, left }) => {
            const active = activeNotes.has(midi);
            return <div key={midi} className={`absolute top-0 rounded-b-md shadow-md transition-colors duration-75 ${active ? "bg-[#06ffd2] shadow-[0_0_12px_#06ffd2]" : "bg-gray-900"}`} style={{ left: `${left}%`, width: `${whiteW * 0.6}%`, height: "60%" }} />;
          })}
        </div>
      </div>
    </div>
  );
}
