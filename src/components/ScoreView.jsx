import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const API = import.meta.env.VITE_API_URL;

export default function ScoreView({ musicXmlUrl, blobPath, onGenerated, seqRef, activePart = -1 }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const cursorAnimRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState(musicXmlUrl || null);

  // Step 1: Resolve URL from backend if needed
  useEffect(() => {
    if (resolvedUrl) return;
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

  useEffect(() => {
    if (musicXmlUrl && !resolvedUrl) setResolvedUrl(musicXmlUrl);
  }, [musicXmlUrl]);

  // Step 2: Render OSMD
  useEffect(() => {
    if (!resolvedUrl || !containerRef.current) return;

    containerRef.current.innerHTML = "";
    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      drawTitle: false,
      drawComposer: false,
      followCursor: true,
      cursorsOptions: [{ type: 1, color: "#06ffd2", alpha: 1.0, follow: true }],
    });
    osmdRef.current = osmd;

    osmd.load(resolvedUrl).then(() => {
      osmd.render();
      osmd.cursor.show();

      // Force cursor to be tall and visible
      const el = osmd.cursor.cursorElement;
      if (el) {
        el.style.width = "3px";
        el.style.minHeight = "80px";
        el.style.zIndex = "50";
        el.style.filter = "none";
        el.style.background = "#06ffd2";
        el.style.boxShadow = "0 0 8px #06ffd2";
        el.style.opacity = "1";
      }
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });

    return () => { osmd.clear(); osmdRef.current = null; };
  }, [resolvedUrl]);

  // Filter visible parts
  useEffect(() => {
    if (!osmdRef.current || loading) return;
    const osmd = osmdRef.current;
    const instruments = osmd.sheet?.Instruments;
    if (!instruments || instruments.length <= 1) return;

    try {
      instruments.forEach((inst, i) => {
        inst.Visible = activePart === -1 || i === activePart;
      });
      osmd.render();
      osmd.cursor.reset();
      osmd.cursor.show();
      const el = osmd.cursor.cursorElement;
      if (el) {
        el.style.width = "3px";
        el.style.minHeight = "80px";
        el.style.zIndex = "50";
        el.style.filter = "none";
        el.style.background = "#06ffd2";
        el.style.boxShadow = "0 0 8px #06ffd2";
        el.style.opacity = "1";
      }
    } catch (e) {
      console.warn("[Ludilo] ScoreView part filter error:", e.message);
    }
  }, [activePart, loading]);

  // Step 3: Sync cursor with playback
  useEffect(() => {
    if (loading || !osmdRef.current) return;

    const osmd = osmdRef.current;
    let lastBeatIndex = -1;

    const animate = () => {
      const seq = seqRef?.current;
      if (seq && !seq.paused && osmd.cursor) {
        const time = seq.currentTime;
        const duration = seq.duration || 1;
        const totalBeats = osmd.sheet?.sourceMeasures?.length * 4 || 100;
        const currentBeat = Math.floor((time / duration) * totalBeats);
        if (currentBeat > lastBeatIndex) {
          const steps = currentBeat - lastBeatIndex;
          for (let i = 0; i < steps && !osmd.cursor.iterator?.endReached; i++) {
            osmd.cursor.next();
            // Re-apply style after each move (OSMD resets it)
            const el = osmd.cursor.cursorElement;
            if (el) {
              el.style.width = "3px";
              el.style.minHeight = "80px";
              el.style.background = "#06ffd2";
              el.style.boxShadow = "0 0 8px #06ffd2";
              el.style.opacity = "1";
              el.style.filter = "none";
            }
          }
          lastBeatIndex = currentBeat;
        } else if (currentBeat < lastBeatIndex) {
          osmd.cursor.reset();
          lastBeatIndex = -1;
        }
      }
      cursorAnimRef.current = requestAnimationFrame(animate);
    };
    cursorAnimRef.current = requestAnimationFrame(animate);

    return () => { if (cursorAnimRef.current) cancelAnimationFrame(cursorAnimRef.current); };
  }, [loading, seqRef]);

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
      <div ref={containerRef} className="w-full overflow-x-auto dark:bg-gray-900 dark:[&_svg]:invert dark:[&_svg]:hue-rotate-180" />
    </div>
  );
}
