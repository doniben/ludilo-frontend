import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const API = import.meta.env.VITE_API_URL;

export default function ScoreView({ musicXmlUrl, blobPath, onGenerated, seqRef, activePart = -1, midiTracks = [], chords = [], lyrics, barTimes: externalBarTimes }) {
  const containerRef = useRef(null);
  const osmdContainerRef = useRef(null);
  const osmdRef = useRef(null);
  const cursorAnimRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [chordOverlays, setChordOverlays] = useState([]);
  const [lyricsOverlays, setLyricsOverlays] = useState([]);

  // Step 1: Resolve URL from backend if needed
  const lastBlobRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // If blobPath same as last time and we have a cached URL, reuse it
    if (blobPath === lastBlobRef.current && musicXmlUrl) {
      setResolvedUrl(musicXmlUrl);
      return;
    }

    setResolvedUrl(null);
    lastBlobRef.current = blobPath;
    if (!blobPath) { setLoading(false); return; }

    const fetchUrl = async () => {
      try {
        const res = await fetch(`${API}/library/musicxml?blobPath=${encodeURIComponent(blobPath)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResolvedUrl(data.url);
        if (onGenerated) onGenerated(data.url);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchUrl();
  }, [blobPath]);

  // Step 2: Render OSMD
  useEffect(() => {
    if (!resolvedUrl || !osmdContainerRef.current) return;

    osmdContainerRef.current.innerHTML = "";
    const osmd = new OpenSheetMusicDisplay(osmdContainerRef.current, {
      autoResize: true,
      drawTitle: false,
      drawComposer: false,
      followCursor: true,
      cursorsOptions: [{ type: 1, color: "#06ffd2", alpha: 1.0, follow: true }],
    });
    osmdRef.current = osmd;

    osmd.load(resolvedUrl).then(() => {
      osmd.render();
      // Hide native cursor - we use our own
      try { osmd.cursor.show(); osmd.cursor.cursorElement.style.display = "none"; } catch (e) {}
      setLoading(false);

      // Position chords above measures
      if ((chords?.length || lyrics) && osmd.sheet?.sourceMeasures) {
        const measures = osmd.sheet.sourceMeasures;
        const tempo = osmd.sheet.defaultStartTempoInBpm || 120;
        const barTimes = [];
        let cumTime = 0;
        for (const m of measures) {
          barTimes.push(cumTime);
          const num = m.timeSignature?.numerator || 4;
          const den = m.timeSignature?.denominator || 4;
          cumTime += (60 / tempo) * num * (4 / den);
        }
        barTimes.push(cumTime);

        const graphic = osmd.graphic;
        const allMeasures = [];
        if (graphic?.measureList) {
          for (let i = 0; i < graphic.measureList.length; i++) {
            const sm = graphic.measureList[i]?.[0];
            if (sm?.boundingBox) {
              const box = sm.boundingBox;
              allMeasures.push({
                x: box.absolutePosition.x * 10,
                y: box.absolutePosition.y * 10,
                w: box.size.width * 10,
              });
            }
          }
        }

        const overlays = [];
        for (const chord of chords) {
          let barIdx = 0;
          for (let i = 0; i < barTimes.length - 1; i++) {
            if (chord.start >= barTimes[i] && chord.start < barTimes[i + 1]) { barIdx = i; break; }
          }
          if (barIdx < allMeasures.length) {
            const mb = allMeasures[barIdx];
            const barStart = barTimes[barIdx];
            const barDur = barTimes[barIdx + 1] - barTimes[barIdx];
            const progress = (chord.start - barStart) / barDur;
            overlays.push({ label: chord.label, x: mb.x + progress * mb.w, y: mb.y - 24 });
          }
        }
        setChordOverlays(overlays);

      }
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });

    return () => { osmd.clear(); osmdRef.current = null; };
  }, [resolvedUrl]);


  // Lyrics overlays - separate effect to avoid reloading OSMD
  useEffect(() => {
    if (!lyrics || !osmdRef.current || loading) { setLyricsOverlays([]); return; }
    const osmd = osmdRef.current;
    const measures = osmd.sheet?.sourceMeasures;
    if (!measures?.length) return;
    const tempo = osmd.sheet.defaultStartTempoInBpm || 120;
    const barTimes = [];
    let cumTime = 0;
    for (const m of measures) {
      barTimes.push(cumTime);
      const num = m.timeSignature?.numerator || 4;
      const den = m.timeSignature?.denominator || 4;
      cumTime += (60 / tempo) * num * (4 / den);
    }
    barTimes.push(cumTime);
    const graphic = osmd.graphic;
    const allMeasures = [];
    if (graphic?.measureList) {
      for (let i = 0; i < graphic.measureList.length; i++) {
        const sm = graphic.measureList[i]?.[0];
        if (sm?.boundingBox) {
          const box = sm.boundingBox;
          allMeasures.push({ x: box.absolutePosition.x * 10, y: box.absolutePosition.y * 10, w: box.size.width * 10 });
        }
      }
    }
    const parsedLyrics = lyrics.split("\n").map(l => {
      const m = l.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
      if (!m) return null;
      return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3] };
    }).filter(Boolean);
    const ovs = [];
    for (const lyric of parsedLyrics) {
      if (!lyric.text) continue;
      let barIdx = 0;
      for (let i = 0; i < barTimes.length - 1; i++) {
        if (lyric.time >= barTimes[i] && lyric.time < barTimes[i + 1]) { barIdx = i; break; }
      }
      if (barIdx < allMeasures.length) {
        const mb = allMeasures[barIdx];
        const barStart = barTimes[barIdx];
        const barDur = barTimes[barIdx + 1] - barTimes[barIdx];
        const progress = (lyric.time - barStart) / barDur;
        ovs.push({ text: lyric.text, x: mb.x + progress * mb.w, y: mb.y + 60 });
      }
    }
    setLyricsOverlays(ovs);
  }, [lyrics, loading]);

  // Filter visible parts — map by MIDI channel from midiTracks
  useEffect(() => {
    if (!osmdRef.current || loading) return;
    const osmd = osmdRef.current;
    const instruments = osmd.sheet?.Instruments;
    if (!instruments || instruments.length <= 1) return;

    // Get the MIDI channel of the selected track
    const selectedChannel = activePart >= 0 && midiTracks[activePart]
      ? midiTracks[activePart].channel
      : -1;

    try {
      if (selectedChannel === -1) {
        // Show all
        instruments.forEach(inst => { inst.Visible = true; });
      } else {
        // Match OSMD instrument to MIDI channel by index (music21 maps channels to parts in order)
        instruments.forEach((inst, i) => {
          // OSMD instruments are ordered by channel (excluding drums which music21 removes)
          // Best heuristic: show instrument at same index, or if channel matches name
          inst.Visible = i === activePart || instruments.length === 1;
        });
      }
      osmd.render();
    } catch (e) {
      console.warn("[Ludilo] ScoreView part filter error:", e.message);
    }
  }, [activePart, midiTracks, loading]);

  // Step 3: Sync cursor with playback — own div cursor like AlphaTabView
  const cursorRef = useRef(null);

  useEffect(() => {
    if (loading || !osmdRef.current || !cursorRef.current || !containerRef.current) return;

    const osmd = osmdRef.current;
    // Hide OSMD native cursor
    if (osmd.cursor?.cursorElement) osmd.cursor.cursorElement.style.display = "none";

    // Use external barTimes (from real MIDI tempo map) or fall back to OSMD
    const measures = osmd.sheet?.sourceMeasures;
    if (!measures?.length) return;
    let barTimes;
    if (externalBarTimes?.length > 1) {
      barTimes = externalBarTimes;
    } else {
      const tempo = osmd.sheet?.defaultStartTempoInBpm || 120;
      barTimes = [];
      let cumTime = 0;
      for (const m of measures) {
        barTimes.push(cumTime);
        const num = m.timeSignature?.numerator || 4;
        const den = m.timeSignature?.denominator || 4;
        cumTime += (60 / tempo) * num * (4 / den);
      }
      barTimes.push(cumTime);
    }

    // Get graphical measure bounds
    const graphic = osmd.graphic;
    const allMeasures = [];
    if (graphic?.measureList) {
      for (let i = 0; i < graphic.measureList.length; i++) {
        const staffMeasures = graphic.measureList[i];
        if (staffMeasures?.[0]) {
          const sm = staffMeasures[0];
          const box = sm.boundingBox;
          if (box) {
            allMeasures.push({
              x: box.absolutePosition.x * 10,
              y: box.absolutePosition.y * 10,
              w: box.size.width * 10,
              h: box.size.height * 10,
            });
          }
        }
      }
    }

    const animate = () => {
      const seq = seqRef?.current;
      if (!seq || !cursorRef.current) { cursorAnimRef.current = requestAnimationFrame(animate); return; }

      if (seq.paused && seq.currentTime === 0) {
        cursorRef.current.style.display = "none";
        cursorAnimRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!seq.paused) {
        const time = seq.currentTime;

        // currentTime is already scaled by playbackRate — compare directly with barTimes
        let barIdx = 0;
        for (let i = 0; i < barTimes.length - 1; i++) {
          if (time >= barTimes[i] && time < barTimes[i + 1]) { barIdx = i; break; }
          if (i === barTimes.length - 2) barIdx = i;
        }

        if (barIdx < allMeasures.length && allMeasures[barIdx]) {
          const barStart = barTimes[barIdx];
          const barDur = barTimes[barIdx + 1] - barTimes[barIdx];
          const progress = Math.min((time - barStart) / barDur, 1);
          const mb = allMeasures[barIdx];
          const x = mb.x + progress * mb.w;
          const y = mb.y;
          const h = mb.h;

          cursorRef.current.style.display = "block";
          cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
          cursorRef.current.style.height = `${h}px`;

          // Auto-scroll
          if (containerRef.current) {
            const scrollTop = containerRef.current.scrollTop;
            const viewH = containerRef.current.clientHeight;
            if (y < scrollTop || y + h > scrollTop + viewH) {
              containerRef.current.scrollTop = y - 20;
            }
          }
        }
      }
      cursorAnimRef.current = requestAnimationFrame(animate);
    };
    cursorAnimRef.current = requestAnimationFrame(animate);

    return () => { if (cursorAnimRef.current) cancelAnimationFrame(cursorAnimRef.current); };
  }, [loading, seqRef, externalBarTimes]);

  useEffect(() => {
    return () => { if (osmdRef.current) { osmdRef.current.clear(); osmdRef.current = null; } };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No se pudo generar la partitura</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="flex flex-col items-center justify-center h-64 gap-2">
          <svg className="w-6 h-6 animate-spin text-ludilo-500 dark:text-neon-cyan" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-xs text-gray-400">{resolvedUrl ? "Cargando..." : "Generando partitura..."}</p>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-auto relative dark:bg-gray-900" style={{ height: "calc(100vh - 280px)" }}>
        <div ref={cursorRef} className="absolute top-0 left-0 z-20 pointer-events-none w-[2px] bg-ludilo-700 dark:bg-[#06ffd2] dark:shadow-[0_0_8px_#06ffd2]" style={{ display: "none" }} />
        {chordOverlays.map((c, i) => (
          <span key={i} className="absolute z-10 text-[11px] font-bold text-teal-600 dark:text-cyan-400 pointer-events-none" style={{ left: c.x, top: c.y }}>{c.label}</span>
        ))}
        {lyrics && lyricsOverlays.map((l, i) => (
          <span key={`ly${i}`} className="absolute z-10 text-[10px] italic text-purple-500 dark:text-purple-400 pointer-events-none" style={{ left: l.x, top: l.y }}>{l.text}</span>
        ))}
        <div ref={osmdContainerRef} className="dark:[&_svg]:invert dark:[&_svg]:hue-rotate-180" />
      </div>
    </div>
  );
}
