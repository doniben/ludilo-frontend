import { useState, useRef, useCallback, useEffect } from "react";
import { PlayIcon, StopIcon } from "@heroicons/react/24/solid";
import * as Tone from "tone";
import { Midi } from "@tonejs/midi";

const API = import.meta.env.VITE_API_URL;

export default function MidiPreview({ blobPath, title }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [midiPath, setMidiPath] = useState(null);
  const [hidden, setHidden] = useState(false);
  const synthsRef = useRef([]);

  useEffect(() => {
    // If it's already a .mid file, use it directly
    if (blobPath.endsWith(".mid") || blobPath.endsWith(".midi")) {
      setMidiPath(blobPath);
    } else {
      // Search for a MIDI version in lakh, then la-midi
      const searchTitle = title.replace(/\s+(gp\d|sm|tab|guitar|solo|acoustic|remix)$/i, "").trim();
      fetch(`${API}/library/search?q=${encodeURIComponent(searchTitle)}&pageSize=1&source=lakh`)
        .then((r) => r.json())
        .then((data) => {
          if (data.results && data.results.length > 0) {
            setMidiPath(data.results[0].blobPath);
          } else {
            // Try la-midi
            return fetch(`${API}/library/search?q=${encodeURIComponent(searchTitle)}&pageSize=1&source=la-midi`)
              .then((r) => r.json())
              .then((data2) => {
                if (data2.results && data2.results.length > 0) {
                  setMidiPath(data2.results[0].blobPath);
                } else {
                  setHidden(true);
                }
              });
          }
        })
        .catch(() => setHidden(true));
    }
  }, [blobPath, title]);

  const stop = useCallback(() => {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    synthsRef.current.forEach((s) => s.dispose());
    synthsRef.current = [];
    setPlaying(false);
  }, []);

  const play = useCallback(async () => {
    if (playing) { stop(); return; }
    if (!midiPath) return;
    setLoading(true);

    try {
      await Tone.start();

      // Get temporary URL for the MIDI file
      const res = await fetch(`${API}/library/preview?blobPath=${encodeURIComponent(midiPath)}`);
      const { url } = await res.json();

      // Download and parse MIDI
      const midiRes = await fetch(url);
      const arrayBuffer = await midiRes.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      // Create synths for each track (max 4 to avoid overload)
      const tracks = midi.tracks.filter((t) => t.notes.length > 0).slice(0, 4);
      const synths = tracks.map(() => new Tone.PolySynth(Tone.Synth, { maxPolyphony: 8 }).toDestination());
      synthsRef.current = synths;

      // Schedule notes
      const transport = Tone.getTransport();
      transport.cancel();
      transport.bpm.value = midi.header.tempos[0]?.bpm || 120;

      tracks.forEach((track, i) => {
        track.notes.forEach((note) => {
          transport.schedule((time) => {
            synths[i]?.triggerAttackRelease(note.name, note.duration, time, note.velocity);
          }, note.time);
        });
      });

      // Auto-stop after 15s preview
      transport.schedule(() => stop(), "+15");
      transport.start();
      setPlaying(true);
    } catch (e) {
      console.error("[Ludilo] MIDI preview error:", e);
    } finally {
      setLoading(false);
    }
  }, [midiPath, playing, stop]);

  if (hidden || !midiPath) return null;

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
      {playing ? "Stop" : "Preview"}
    </button>
  );
}
