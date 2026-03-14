import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const API = import.meta.env.VITE_API_URL;

export default function ScoreView({ musicXmlUrl, blobPath, onGenerated }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    console.log("[Ludilo] ScoreView mounted, blobPath:", blobPath, "musicXmlUrl:", musicXmlUrl);

    const loadScore = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = musicXmlUrl;

        // If no MusicXML URL but we have a MIDI blobPath, request conversion
        if (!url && blobPath) {
          console.log("[Ludilo] ScoreView: requesting MusicXML for", blobPath);
          const res = await fetch(`${API}/library/musicxml?blobPath=${encodeURIComponent(blobPath)}`);
          const data = await res.json();
          console.log("[Ludilo] ScoreView: response", data);
          if (data.error) throw new Error(data.error);
          url = data.url;
          if (onGenerated) onGenerated(url);
        }

        if (!url || !url.startsWith("http")) {
          setError("no_musicxml");
          setLoading(false);
          return;
        }

        console.log("[Ludilo] ScoreView: loading OSMD with", url);
        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawTitle: false,
          drawComposer: false,
        });
        osmdRef.current = osmd;
        await osmd.load(url);
        console.log("[Ludilo] ScoreView: rendering");
        osmd.render();
        console.log("[Ludilo] ScoreView: done");
      } catch (e) {
        console.error("[Ludilo] ScoreView error:", e);
        setError(e.message || "score_load_error");
      } finally {
        setLoading(false);
      }
    };

    loadScore();

    return () => {
      if (osmdRef.current) osmdRef.current.clear();
    };
  }, [musicXmlUrl, blobPath]);

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
          <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-400">Generando partitura...</p>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-x-auto dark:invert dark:hue-rotate-180" />
    </div>
  );
}
