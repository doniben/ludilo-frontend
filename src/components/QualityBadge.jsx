/**
 * Source badge with icon in gradient box.
 * Guitar Pro = guitar (green), MIDI = music note (amber), Ludilo = L (cyan→magenta)
 */

import { IoMusicalNotes } from "react-icons/io5";

export default function QualityBadge({ source }) {
  if (source === "ludilo") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-neon-cyan to-neon-magenta" title="Ludilo IA">
        <span className="flex items-center justify-center w-[20px] h-[20px] rounded-[4px] bg-gray-900">
          <span className="text-neon-cyan font-bold text-[10px]">L</span>
        </span>
      </span>
    );
  }

  if (source === "guitarpro") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-green-400 to-emerald-600" title="Tablatura">
        <span className="flex items-center justify-center w-[20px] h-[20px] rounded-[4px] bg-gray-900">
          <span className="text-green-400 font-bold text-[10px]">T</span>
        </span>
      </span>
    );
  }

  // MIDI
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-amber-300 to-orange-500" title="Secuencia MIDI">
      <span className="flex items-center justify-center w-[20px] h-[20px] rounded-[4px] bg-gray-900">
        <IoMusicalNotes className="w-3 h-3 text-amber-400" />
      </span>
    </span>
  );
}
