import { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";

const NOTE_HEIGHT = 4;
const PX_PER_SECOND = 80;

export default function PianoRollView({ midiUrl }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!midiUrl || !canvasRef.current) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Check if it's a MIDI file
        if (!midiUrl.includes(".mid")) {
          setError("Este archivo no es MIDI. Se necesita convertir para visualizar.");
          setLoading(false);
          return;
        }
        const res = await fetch(midiUrl);
        if (!res.ok) throw new Error("No se pudo descargar");
        const arrayBuffer = await res.arrayBuffer();
        const midi = new Midi(arrayBuffer);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Calculate dimensions
        const duration = midi.duration;
        const width = Math.max(canvas.parentElement.clientWidth, duration * PX_PER_SECOND);
        const height = 128 * NOTE_HEIGHT; // 128 MIDI notes

        canvas.width = width;
        canvas.height = height;

        // Dark background
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines (octaves)
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        for (let i = 0; i < 128; i += 12) {
          ctx.beginPath();
          ctx.moveTo(0, (127 - i) * NOTE_HEIGHT);
          ctx.lineTo(width, (127 - i) * NOTE_HEIGHT);
          ctx.stroke();
        }

        // Colors per track
        const colors = ["#06ffd2", "#ff06c4", "#8b5cf6", "#fbbf24", "#14b8a6", "#ef4444"];

        // Draw notes
        midi.tracks.forEach((track, trackIdx) => {
          const color = colors[trackIdx % colors.length];
          ctx.fillStyle = color;

          track.notes.forEach((note) => {
            const x = note.time * PX_PER_SECOND;
            const y = (127 - note.midi) * NOTE_HEIGHT;
            const w = Math.max(2, note.duration * PX_PER_SECOND);
            const h = NOTE_HEIGHT - 1;

            ctx.globalAlpha = 0.6 + note.velocity * 0.4;
            ctx.fillRect(x, y, w, h);
          });
        });

        ctx.globalAlpha = 1;
      } catch (e) {
        console.error("[Ludilo] Piano roll error:", e);
        setError("No se pudo cargar el MIDI");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [midiUrl]);

  if (!midiUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No hay MIDI disponible para esta canción</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-ludilo-500 dark:border-neon-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
