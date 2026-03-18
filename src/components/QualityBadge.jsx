/**
 * Quality indicator badge based on source type.
 * Guitar Pro = 5 bars (highest), MIDI = 3 bars, Ludilo processed = logo
 */
export default function QualityBadge({ source }) {
  if (source === "ludilo") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-neon-cyan to-neon-magenta" title="Procesada por Ludilo IA">
        <span className="flex items-center justify-center w-[20px] h-[20px] rounded-[4px] bg-gray-900">
          <span className="text-neon-cyan font-bold text-[10px]">L</span>
        </span>
      </span>
    );
  }

  const levels = source === "guitarpro" ? 5 : 3;
  const color = source === "guitarpro"
    ? "bg-green-500 dark:bg-green-400"
    : "bg-amber-400 dark:bg-amber-300";
  const label = source === "guitarpro"
    ? "Tablatura completa"
    : "MIDI estándar";

  return (
    <span className="flex items-center gap-0.5" title={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1 rounded-full ${i < levels ? color : "bg-gray-200 dark:bg-white/10"}`}
          style={{ height: `${8 + i * 2}px` }}
        />
      ))}
    </span>
  );
}
