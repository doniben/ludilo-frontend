import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const API = import.meta.env.VITE_API_URL;

export default function ScoreView({ musicXmlUrl, blobPath }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const loadScore = async () => {
      setLoading(true);
      setError(null);

      try {
        let url = musicXmlUrl;

        // If no MusicXML URL but we have a MIDI blobPath, request conversion
        if (!url && blobPath) {
          const res = await fetch(`${API}/library/musicxml?blobPath=${encodeURIComponent(blobPath)}`);
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          url = data.url;
        }

        if (!url) {
          setError("no_musicxml");
          setLoading(false);
          return;
        }

        const osmd = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawTitle: false,
          drawComposer: false,
        });
        osmdRef.current = osmd;
        await osmd.load(url);
        osmd.render();
      } catch (e) {
        console.error("[Ludilo] OSMD error:", e);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-400">Generando partitura...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No se pudo generar la partitura</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full overflow-x-auto" />;
}
