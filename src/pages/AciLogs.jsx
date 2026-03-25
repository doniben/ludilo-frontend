import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL;

const ASCII_ART = `╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║         ██╗     ██╗   ██╗ ██████╗  ██╗ ██╗      ██████╗                     ║
║         ██║     ██║   ██║ ██╔══██╗ ██║ ██║     ██╔═══██╗                    ║
║         ██║     ██║   ██║ ██║  ██║ ██║ ██║     ██║   ██║                    ║
║         ██║     ██║   ██║ ██║  ██║ ██║ ██║     ██║   ██║                    ║
║         ███████╗╚██████╔╝ ██████╔╝ ██║ ███████╗╚██████╔╝                    ║
║         ╚══════╝ ╚═════╝  ╚═════╝  ╚═╝ ╚══════╝ ╚═════╝                     ║
║                                                                              ║
║                            ACI LOGS                                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
                                                        By Doniben Jimenez`;

function formatLine(line) {
  if (/Paso \d/.test(line)) return <span className="text-[#06ffd2] font-bold">{line}</span>;
  if (/^=>/.test(line) || /completado|Stems:|Acordes:|MIDI:|Subido:|MP3:|Descargado:/i.test(line)) return <span className="text-amber-400">{/^=>/.test(line) ? "" : "=> "}{line}</span>;
  if (/Error|error|failed/i.test(line) && !/WARNING/.test(line)) return <span className="text-red-400">{line}</span>;
  if (/Nueva cancion|Song ID|Usuario/.test(line)) return <span className="text-purple-400">{line}</span>;
  if (/Separando|Detectando|Convirtiendo|Guardando|Descargando audio/.test(line)) return <span className="text-cyan-300">{line}</span>;
  if (/Auto-stop|Nodo detenido|Nodo iniciado/.test(line)) return <span className="text-yellow-300 font-bold">{line}</span>;
  if (/Node ID|Device:|API:|Selected model|Separated tracks|Separating track/.test(line)) return <span className="text-gray-500">{line}</span>;
  if (/WARNING/.test(line)) return <span className="text-gray-600 text-[11px]">{line}</span>;
  if (/Downloading:/.test(line)) return <span className="text-gray-500 text-[11px]">{line}</span>;
  if (/Predicting MIDI/.test(line)) return <span className="text-blue-400">{line}</span>;
  if (/\d+%\|/.test(line)) return <span className="text-gray-500">{line}</span>;
  return <span className="text-gray-400">{line}</span>;
}

function filterLogs(raw) {
  // Split lines, also split on \r and on percentage boundaries (tqdm puts multiple on one line)
  const rawLines = raw.replace(/\r/g, "\n").split("\n");
  const lines = [];
  for (const rl of rawLines) {
    // Split where a new progress bar starts: space + digit(s) + %|
    const parts = rl.split(/(?<=\]) (?=\d+%\|)/);
    for (const p of parts) if (p.trim()) lines.push(p);
  }

  const filtered = [];
  let lastBar = null;
  let inSeparating = false;
  let prevWasDownload = false;

  for (const line of lines) {
    // Skip ASCII art from backend
    if (/[╔╗╚╝║]|██╗.*║|╚══.*╝/.test(line)) continue;
    if (/^\s*ludilo\.app\s*$/.test(line)) continue;
    if (/Esperando jobs/.test(line)) continue;

    // Track download lines
    if (/^Downloading:/.test(line)) {
      if (lastBar) { filtered.push(lastBar); lastBar = null; }
      prevWasDownload = true;
      filtered.push(line);
      continue;
    }

    // Download progress (only show 100%)
    if (prevWasDownload && /\d+%\|/.test(line)) {
      if (/100%\|/.test(line)) {
        filtered.push(`  ${line.trim()}`);
        prevWasDownload = false;
      }
      continue;
    }
    prevWasDownload = false;

    // Detect separation track start
    if (/Separating track/.test(line)) {
      if (lastBar) { filtered.push(lastBar); lastBar = null; }
      inSeparating = true;
      filtered.push(line);
      continue;
    }

    // tqdm bars during separation: keep only the latest per pass
    if (inSeparating && /\d+%\|/.test(line)) {
      lastBar = `  ${line.trim()}`;
      if (/100%\|/.test(line)) {
        filtered.push(lastBar);
        lastBar = null;
        // Don't reset inSeparating - there are multiple passes
      }
      continue;
    }

    // Any non-progress line flushes pending bar
    if (lastBar) {
      filtered.push(lastBar);
      lastBar = null;
    }
    if (/Paso \d|Selected model|Separated tracks/.test(line)) {
      inSeparating = false;
    }

    if (line.trim()) filtered.push(line);
  }
  if (lastBar) filtered.push(lastBar);
  return filtered;
}

export default function AciLogs() {
  const [logs, setLogs] = useState("");
  const [state, setState] = useState("...");
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const doneTimeRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const termRef = useRef(null);
  const maxLogsRef = useRef("");

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/aci/logs`);
        if (!res.ok) return;
        const data = await res.json();
        const s = data.state || "Unknown";
        console.log("[aci/logs] state:", s, "logs length:", data.logs?.length || 0);
        setState(s);

        // Keep the longest logs we've seen (don't lose them on container restart)
        if (data.logs && data.logs.length > maxLogsRef.current.length) {
          maxLogsRef.current = data.logs;
          setLogs(data.logs);
        }

        if (s === "Succeeded" || s === "Terminated" || s === "Stopped") {
          if (!/Cancion procesada/.test(maxLogsRef.current) && /Predicting|Convirtiendo|Subiendo/.test(maxLogsRef.current)) {
            maxLogsRef.current += "\n\n=> Cancion procesada exitosamente!";
            setLogs(maxLogsRef.current);
          }
          setStopped(true);
          setCountdown(null);
        } else if (s === "Running" && maxLogsRef.current) {
          if (/Nodo detenido/.test(maxLogsRef.current)) {
            setStopped(true);
          } else if (/completado/.test(maxLogsRef.current) && !doneTimeRef.current && !/Convirtiendo|Predicting|Subiendo/.test(maxLogsRef.current.split("\n").slice(-5).join("\n"))) {
            doneTimeRef.current = Date.now();
          }
        }
      } catch (e) {
        console.log("[aci/logs] error:", e.message);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (stopped) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [stopped]);

  useEffect(() => {
    if (!doneTimeRef.current || stopped) return;
    const id = setInterval(() => {
      const remaining = 120 - Math.floor((Date.now() - doneTimeRef.current) / 1000);
      setCountdown(remaining > 0 ? remaining : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [stopped]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logs]);

  const lines = filterLogs(logs.replace(/\x1b\[[0-9;]*m/g, ""));
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const stateColor = state === "Running" ? "text-green-400" : stopped ? "text-gray-500" : "text-cyan-400";

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${stopped ? "bg-gray-600" : "bg-gradient-to-br from-[#06ffd2] to-[#ff06c4] animate-pulse"}`} />
          <h1 className="text-white font-mono text-lg">ludilo<span className="text-[#06ffd2]">::</span>worker</h1>
        </div>
        <div className="flex items-center gap-3">
          {countdown !== null && countdown > 0 && (
            <span className="text-xs font-mono text-yellow-400">auto-stop {fmt(countdown)}</span>
          )}
          <span className="text-xs font-mono text-gray-500">{fmt(elapsed)}</span>
          <span className={`text-xs font-mono font-bold ${stateColor}`}>{stopped ? "APAGADO" : state === "Running" ? "ACTIVO" : state}</span>
        </div>
      </div>

      <div className="w-full max-w-5xl rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-[#06ffd2]/5">
        <div className="bg-[#1a1a26] px-4 py-2 flex items-center gap-2 border-b border-white/5">
          <div className={`w-3 h-3 rounded-full ${stopped ? "bg-gray-600" : "bg-red-500/80"}`} />
          <div className={`w-3 h-3 rounded-full ${stopped ? "bg-gray-600" : "bg-yellow-500/80"}`} />
          <div className={`w-3 h-3 rounded-full ${stopped ? "bg-gray-600" : "bg-green-500/80"}`} />
          <span className="ml-3 text-xs text-gray-500 font-mono">ludilo-worker — ACI (8 vCPU, 16 GB)</span>
        </div>

        <div
          ref={termRef}
          className="bg-[#0d0d14] p-4 font-mono text-[13px] leading-relaxed overflow-auto"
          style={{ height: "70vh" }}
        >
          {lines.length > 0 && (
            <pre className="text-[#06ffd2] text-[10px] leading-none mb-4 opacity-80 mx-auto w-fit">{ASCII_ART}</pre>
          )}
          {lines.map((line, i) => (
            <div key={i}>{formatLine(line)}</div>
          ))}
          {stopped && (
            <div className="mt-4 text-gray-500 border-t border-white/5 pt-4">-- worker apagado --</div>
          )}
          {!stopped && <span className="inline-block w-2 h-4 bg-[#06ffd2] animate-pulse ml-0.5" />}
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-4 font-mono">
        {stopped ? "el worker se apago por inactividad" : "polling 5s"}
      </p>
    </div>
  );
}
