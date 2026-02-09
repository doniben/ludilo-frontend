import Chromaprint from "chromaprint-fixed";

const SAMPLE_RATE = 22050;
const DURATION_LIMIT = 120; // solo analizar primeros 120s

/**
 * Genera fingerprint de un archivo de audio usando Web Audio API + Chromaprint.
 * @param {File} file - archivo de audio
 * @returns {Promise<{fingerprint: string, duration: number}>}
 */
export async function getFingerprint(file) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = Math.min(audioBuffer.duration, DURATION_LIMIT);
    const samples = audioBuffer.getChannelData(0).slice(0, Math.floor(duration * SAMPLE_RATE));

    const chromaprint = new Chromaprint({ sampleRate: SAMPLE_RATE });
    chromaprint.start();
    chromaprint.feed(samples);
    chromaprint.finish();

    const fingerprint = chromaprint.getFingerprint();
    return { fingerprint, duration: Math.round(audioBuffer.duration) };
  } finally {
    audioCtx.close();
  }
}
