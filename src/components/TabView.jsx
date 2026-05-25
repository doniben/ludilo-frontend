import { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";

const TUNING = [40, 45, 50, 55, 59, 64];
const NUM_STRINGS = 6;
const MAX_FRET = 24;
const STRING_SPACING = 14;
const LINE_HEIGHT = NUM_STRINGS * STRING_SPACING + 50;
const MARGIN_LEFT = 70;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 150;

function assignFret(midi, handPosition = 0) {
  let bestString = -1, bestFret = -1, bestDist = Infinity;
  for (let s = 0; s < NUM_STRINGS; s++) {
    const fret = midi - TUNING[s];
    if (fret >= 0 && fret <= MAX_FRET) {
      let dist = fret + s * 0.3;
      if (fret === 0) dist -= 3; // open string bonus
      if (handPosition > 0) dist += Math.abs(fret - handPosition) * 0.5;
      if (dist < bestDist) { bestDist = dist; bestString = s; bestFret = fret; }
    }
  }
  return bestString >= 0 ? { string: bestString, fret: bestFret } : null;
}

export default function TabView({ midiUrl, seqRef, activePart = -1, tracks = [], songTitle, songArtist, chords = [], lyrics }) {
  if (lyrics) console.log("[TabView] lyrics prop:", lyrics.length, "chars");
  const containerRef = useRef(null);
  const [showNoteNames, setShowNoteNames] = useState(false);
  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const midiToNote = (m) => NOTE_NAMES[m % 12] + Math.floor(m / 12 - 1);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const notesRef = useRef([]);
  const durationRef = useRef(0);
  const tempoRef = useRef(120);
  const timeSigRef = useRef([4, 4]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!midiUrl || !canvasRef.current) return;

    const load = async () => {
      try {
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("No se pudo descargar");
        const buf = await res.arrayBuffer();
        const midi = new Midi(buf);

        // Extract tempo and time signature
        if (midi.header.tempos?.length) tempoRef.current = Math.round(midi.header.tempos[0].bpm);
        if (midi.header.timeSignatures?.length) {
          const ts = midi.header.timeSignatures[0].timeSignature;
          timeSigRef.current = ts || [4, 4];
        }

        const notes = [];
        let maxTime = 0;
        for (const track of midi.tracks) {
          const ch = track.channel;
          for (const note of track.notes) {
            const pos = assignFret(note.midi);
            if (pos) {
              notes.push({ ...pos, start: note.time, dur: note.duration, channel: ch, velocity: note.velocity, midi: note.midi });
              maxTime = Math.max(maxTime, note.time + note.duration);
            }
          }
        }

        // Detect hammer-ons/pull-offs (consecutive notes on same string within 30ms gap)
        notes.sort((a, b) => a.start - b.start || a.string - b.string);
        for (let i = 1; i < notes.length; i++) {
          const prev = notes[i - 1];
          const curr = notes[i];
          if (curr.channel === prev.channel && curr.string === prev.string) {
            const gap = curr.start - (prev.start + prev.dur);
            if (gap < 0.05 && gap > -0.02) {
              curr.legato = true; // hammer-on or pull-off
              curr.legatoFrom = prev;
            }
          }
        }

        // Detect pitch bends from the MIDI pitchBends array
        const bends = [];
        for (const track of midi.tracks) {
          if (track.pitchBends) {
            for (const pb of track.pitchBends) {
              if (Math.abs(pb.value) > 0.1) {
                bends.push({ time: pb.time, value: pb.value, channel: track.channel });
              }
            }
          }
        }

        notesRef.current = notes;
        notesRef.current._bends = bends;
        durationRef.current = maxTime;
        setLoading(false);
        startAnimation();
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };

    const startAnimation = () => {
      const render = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        const w = container.clientWidth;
        const dpr = window.devicePixelRatio || 1;
        const duration = durationRef.current || 1;
        const tempo = tempoRef.current;
        const [tsNum, tsDen] = timeSigRef.current;
        const secPerBeat = 60 / tempo;
        const secPerMeasure = secPerBeat * tsNum * (4 / tsDen);
        const numMeasures = Math.ceil(duration / secPerMeasure);
        const measuresPerLine = Math.max(2, Math.floor((w - MARGIN_LEFT - MARGIN_RIGHT) / 200));
        const numLines = Math.ceil(numMeasures / measuresPerLine);
        const lineWidth = w - MARGIN_LEFT - MARGIN_RIGHT;
        const measureWidth = lineWidth / measuresPerLine;
        const totalHeight = MARGIN_TOP + numLines * LINE_HEIGHT + 40;

        canvas.width = w * dpr;
        canvas.height = totalHeight * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = totalHeight + "px";
        ctx.scale(dpr, dpr);

        const isDark = document.documentElement.classList.contains("dark");
        ctx.fillStyle = isDark ? "#111118" : "#ffffff";
        ctx.fillRect(0, 0, w, totalHeight);

        const currentTime = seqRef?.current?.currentTime || 0;
        const rate = seqRef?.current?.playbackRate || 1;
        const filterCh = activePart >= 0 && tracks[activePart] ? tracks[activePart].channel : -1;

        // Header
        ctx.textAlign = "center";
        ctx.fillStyle = isDark ? "#ffffff" : "#000000";
        ctx.font = "bold 24px serif";
        ctx.fillText(songTitle || "Untitled", w / 2, 55);
        ctx.font = "14px serif";
        ctx.fillStyle = isDark ? "#aaaaaa" : "#555555";
        ctx.fillText(songArtist || "", w / 2, 80);
        // Tempo + time sig
        ctx.textAlign = "left";
        ctx.font = "11px monospace";
        ctx.fillStyle = isDark ? "#888888" : "#666666";
        ctx.fillText(`♩ = ${tempo}`, MARGIN_LEFT, 110);
        ctx.fillText(`${tsNum}/${tsDen}`, MARGIN_LEFT + 70, 110);
        // Tuning
        ctx.textAlign = "right";
        ctx.fillText("Standard Tuning", w - MARGIN_RIGHT, 110);

        // Draw each line
        for (let line = 0; line < numLines; line++) {
          const lineY = MARGIN_TOP + line * LINE_HEIGHT;
          const firstMeasure = line * measuresPerLine;

          // Draw strings
          ctx.strokeStyle = isDark ? "#cccccc" : "#000000";
          ctx.lineWidth = 1;
          for (let s = 0; s < NUM_STRINGS; s++) {
            const y = lineY + s * STRING_SPACING;
            ctx.beginPath();
            ctx.moveTo(MARGIN_LEFT, y);
            ctx.lineTo(MARGIN_LEFT + lineWidth, y);
            ctx.stroke();
          }

          // TAB clef
          ctx.fillStyle = isDark ? "#cccccc" : "#000000";
          ctx.font = "bold 12px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const midY = lineY + (NUM_STRINGS - 1) * STRING_SPACING / 2;
          ctx.fillText("T", MARGIN_LEFT - 20, midY - 10);
          ctx.fillText("A", MARGIN_LEFT - 20, midY);
          ctx.fillText("B", MARGIN_LEFT - 20, midY + 10);

          // Measure bar lines and numbers
          for (let m = 0; m <= measuresPerLine; m++) {
            const measureIdx = firstMeasure + m;
            if (measureIdx > numMeasures) break;
            const x = MARGIN_LEFT + m * measureWidth;

            // Bar line
            ctx.strokeStyle = isDark ? "#cccccc" : "#000000";
            ctx.lineWidth = m === 0 || m === measuresPerLine ? 1.5 : 0.8;
            ctx.beginPath();
            ctx.moveTo(x, lineY);
            ctx.lineTo(x, lineY + (NUM_STRINGS - 1) * STRING_SPACING);
            ctx.stroke();

            // Measure number (red, above staff)
            if (m < measuresPerLine && measureIdx < numMeasures) {
              ctx.fillStyle = isDark ? "#ff6666" : "#cc0000";
              ctx.font = "9px monospace";
              ctx.textAlign = "left";
              ctx.textBaseline = "bottom";
              ctx.fillText((measureIdx + 1).toString(), x + 3, lineY - 4);
            }
          }

          // Draw chords above staff
          if (chords && chords.length > 0) {
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = isDark ? "#06ffd2" : "#0f766e";
            for (const chord of chords) {
              const chordTime = chord.start / rate;
              const chordMeasure = Math.floor(chordTime / (secPerMeasure / rate));
              const localM = chordMeasure - firstMeasure;
              if (localM < 0 || localM >= measuresPerLine) continue;
              const mStart = chordMeasure * (secPerMeasure / rate);
              const posInM = (chordTime - mStart) / (secPerMeasure / rate);
              const cx = MARGIN_LEFT + localM * measureWidth + posInM * measureWidth;
              ctx.fillText(chord.label, cx, lineY - 8);
            }
          }

          // Draw lyrics below staff
          if (lyrics) {
            const parsedLyrics = lyrics.split("\n").map(l => {
              const m = l.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
              if (!m) return null;
              return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3] };
            }).filter(Boolean);

            ctx.font = "italic 10px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillStyle = isDark ? "#a78bfa" : "#7c3aed";
            const staffBottom = lineY + STRING_SPACING * 5 + 12;
            for (const lyric of parsedLyrics) {
              if (!lyric.text) continue;
              const lyricTime = lyric.time / rate;
              const lyricMeasure = Math.floor(lyricTime / (secPerMeasure / rate));
              const localM = lyricMeasure - firstMeasure;
              if (localM < 0 || localM >= measuresPerLine) continue;
              const mStart = lyricMeasure * (secPerMeasure / rate);
              const posInM = (lyricTime - mStart) / (secPerMeasure / rate);
              const lx = MARGIN_LEFT + localM * measureWidth + posInM * measureWidth;
              ctx.fillText(lyric.text, lx, staffBottom);
            }
          }

          // Draw notes in this line's measures
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const note of notesRef.current) {
            if (filterCh >= 0 && note.channel !== filterCh) continue;
            const noteTime = note.start / rate;
            const measureIdx = Math.floor(noteTime / (secPerMeasure / rate));
            const localMeasure = measureIdx - firstMeasure;
            if (localMeasure < 0 || localMeasure >= measuresPerLine) continue;

            const measureStartTime = measureIdx * (secPerMeasure / rate);
            const posInMeasure = (noteTime - measureStartTime) / (secPerMeasure / rate);
            const x = MARGIN_LEFT + localMeasure * measureWidth + posInMeasure * measureWidth;
            const y = lineY + (NUM_STRINGS - 1 - note.string) * STRING_SPACING;
            const isActive = Math.abs(noteTime - currentTime) < 0.08;

            // Clear bg
            ctx.fillStyle = isDark ? "#111118" : "#ffffff";
            ctx.fillRect(x - 9, y - 8, 18, 16);

            const color = isActive ? "#06ffd2" : (isDark ? "#e0e0e0" : "#000000");
            ctx.fillStyle = color;
            ctx.font = isActive ? (showNoteNames ? "bold 10px monospace" : "bold 14px monospace") : (showNoteNames ? "9px monospace" : "13px monospace");
            if (isActive) { ctx.shadowColor = "#06ffd2"; ctx.shadowBlur = 6; }
            // Ghost note (low velocity)
            if (note.velocity < 0.4) {
              ctx.globalAlpha = 0.5;
              ctx.fillText(showNoteNames ? `(${midiToNote(note.midi)})` : `(${note.fret})`, x, y);
              ctx.globalAlpha = 1;
            } else {
              ctx.fillText(showNoteNames ? midiToNote(note.midi) : note.fret.toString(), x, y);
            }
            ctx.shadowBlur = 0;

            // Legato arc (hammer-on / pull-off)
            if (note.legato && note.legatoFrom) {
              const fromTime = note.legatoFrom.start / rate;
              const fromMeasure = Math.floor(fromTime / (secPerMeasure / rate));
              const fromLocal = fromMeasure - firstMeasure;
              if (fromLocal >= 0 && fromLocal < measuresPerLine) {
                const fromMeasureStart = fromMeasure * (secPerMeasure / rate);
                const fromPos = (fromTime - fromMeasureStart) / (secPerMeasure / rate);
                const fromX = MARGIN_LEFT + fromLocal * measureWidth + fromPos * measureWidth;
                const fromY = lineY + (NUM_STRINGS - 1 - note.legatoFrom.string) * STRING_SPACING;
                // Draw arc
                ctx.strokeStyle = isDark ? "#06ffd2" : "#0f766e";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                const midX = (fromX + x) / 2;
                const arcY = Math.min(fromY, y) - 10;
                ctx.moveTo(fromX, fromY - 7);
                ctx.quadraticCurveTo(midX, arcY, x, y - 7);
                ctx.stroke();
                // H or P label
                ctx.font = "8px sans-serif";
                ctx.fillStyle = isDark ? "#06ffd2" : "#0f766e";
                ctx.textAlign = "center";
                ctx.fillText(note.fret > note.legatoFrom.fret ? "H" : "P", midX, arcY - 2);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
              }
            }
          }

          // Bend indicators (disabled for now - Basic Pitch generates too many false positives)
          // TODO: re-enable when we have real GP files with intentional bends

          // Cursor
          for (let m = 0; m < measuresPerLine; m++) {
            const measureIdx = firstMeasure + m;
            const measureStart = measureIdx * (secPerMeasure / rate);
            const measureEnd = (measureIdx + 1) * (secPerMeasure / rate);
            if (currentTime >= measureStart && currentTime < measureEnd) {
              const posInMeasure = (currentTime - measureStart) / (secPerMeasure / rate);
              const cursorX = MARGIN_LEFT + m * measureWidth + posInMeasure * measureWidth;
              ctx.strokeStyle = isDark ? "#06ffd2" : "#0f766e";
              ctx.shadowColor = isDark ? "#06ffd2" : "#0f766e";
              ctx.shadowBlur = 6;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(cursorX, lineY - 2);
              ctx.lineTo(cursorX, lineY + (NUM_STRINGS - 1) * STRING_SPACING + 2);
              ctx.stroke();
              ctx.shadowBlur = 0;

              // Auto-scroll
              if (lineY > container.scrollTop + container.clientHeight - 60 || lineY < container.scrollTop) {
                container.scrollTop = lineY - 40;
              }
              break;
            }
          }
        }

        animRef.current = requestAnimationFrame(render);
      };
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(render);
    };

    load();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [midiUrl, seqRef, activePart, tracks, chords, lyrics, showNoteNames]);

  if (!midiUrl) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">No hay MIDI disponible</p></div>;
  if (error) return <div className="flex items-center justify-center h-64 text-gray-400"><p className="text-sm">{error}</p></div>;

  return (
    <div ref={containerRef} className="w-full relative" style={{ height: "calc(100vh - 280px)", overflow: "auto" }}>
      <button onClick={() => setShowNoteNames(!showNoteNames)} className={`absolute top-2 right-2 z-10 px-2 py-1 rounded text-[10px] font-bold transition-all ${showNoteNames ? "bg-ludilo-200 dark:bg-neon-cyan/20 text-ludilo-700 dark:text-neon-cyan" : "bg-gray-200/80 dark:bg-white/10 text-gray-500 dark:text-gray-400"}`}>{showNoteNames ? "C D E" : "1 2 3"}</button>
      {loading && (
        <div className="flex items-center justify-center h-64 gap-2">
          <svg className="w-6 h-6 animate-spin text-ludilo-500 dark:text-neon-cyan" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-gray-400">Cargando tablatura...</p>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
