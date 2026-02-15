import { useState } from "react";

export default function TabView({ midiUrl }) {
  if (!midiUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No hay MIDI disponible para esta canción</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
      <p className="text-sm">La tablatura estará disponible próximamente</p>
      <p className="text-xs mt-2">Requiere algoritmo de asignación de posiciones en diapasón (S8-05)</p>
    </div>
  );
}
