import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export default function ScoreView({ musicXmlUrl, midiUrl }) {
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
        if (musicXmlUrl) {
          // Load MusicXML directly
          const osmd = new OpenSheetMusicDisplay(containerRef.current, {
            autoResize: true,
            drawTitle: false,
            drawComposer: false,
          });
          osmdRef.current = osmd;
          await osmd.load(musicXmlUrl);
          osmd.render();
        } else {
          setError("score_needs_musicxml");
        }
      } catch (e) {
        console.error("[Ludilo] OSMD error:", e);
        setError("score_load_error");
      } finally {
        setLoading(false);
      }
    };

    loadScore();

    return () => {
      if (osmdRef.current) {
        osmdRef.current.clear();
      }
    };
  }, [musicXmlUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">La partitura estará disponible cuando se procese el MIDI a MusicXML</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full overflow-x-auto" />;
}
