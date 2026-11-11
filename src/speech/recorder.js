// Records one spoken attempt with MediaRecorder and stops by itself after
// the learner goes quiet (simple voice-activity detection on mic volume).
//
// iOS notes: Safari records audio/mp4 (AAC); Chrome records audio/webm.
// We release the microphone after every attempt, because an open mic makes
// iOS route speech playback to the quiet earpiece-style output.

export function recordingSupported() {
  return typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
}

function pickMime() {
  const options = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'];
  return options.find((m) => window.MediaRecorder.isTypeSupported?.(m)) || '';
}

let audioCtx = null;
function ctx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx && AC) audioCtx = new AC();
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/**
 * @param {{onLevel?:(n:number)=>void, maxMs?:number, signal?:AbortSignal, quiet?:boolean}} opts
 *   quiet: don't auto-stop on silence (the caller stops it).
 * @returns {Promise<{stop:Function, done:Promise<{blob:Blob|null,url:string|null,spoke:boolean}>}>}
 */
export async function createRecorder({ onLevel, maxMs = 8000, signal, quiet = false } = {}) {
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* Safari 16.4+ only */ }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const mimeType = pickMime();
  const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

  // Volume meter for the "listening" animation and silence detection.
  let spoke = false;
  let raf = 0;
  const ac = ctx();
  let analyser = null;
  let source = null;
  if (ac) {
    source = ac.createMediaStreamSource(stream);
    analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
  }
  const buf = new Uint8Array(512);
  const started = performance.now();
  let lastLoud = started;
  const SPEECH_LEVEL = 0.045;
  const SILENCE_AFTER_SPEECH_MS = 1300;
  const GIVE_UP_IF_SILENT_MS = 6000;

  const tick = () => {
    if (analyser) {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      onLevel?.(Math.min(1, rms * 6));
      const now = performance.now();
      if (rms > SPEECH_LEVEL) { spoke = true; lastLoud = now; }
      if (!quiet) {
        if (spoke && now - lastLoud > SILENCE_AFTER_SPEECH_MS) return stop();
        if (!spoke && now - started > GIVE_UP_IF_SILENT_MS) return stop();
      }
    } else {
      spoke = true; // can't measure: assume he spoke
    }
    if (performance.now() - started > maxMs) return stop();
    raf = requestAnimationFrame(tick);
  };

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { if (mr.state !== 'inactive') mr.stop(); } catch { /* ignore */ }
  }

  const done = new Promise((resolve) => {
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      try { source?.disconnect(); } catch { /* ignore */ }
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }
      onLevel?.(0);
      const blob = chunks.length ? new Blob(chunks, { type: mr.mimeType || mimeType || 'audio/mp4' }) : null;
      resolve({ blob, url: blob ? URL.createObjectURL(blob) : null, spoke: spoke && !!blob });
    };
  });

  signal?.addEventListener('abort', stop, { once: true });
  mr.start(250);
  raf = requestAnimationFrame(tick);
  return { stop, done };
}

/** Play a recorded clip; resolves when finished. */
export function playClip(url) {
  return new Promise((resolve) => {
    if (!url) return resolve();
    const a = new Audio(url);
    a.onended = resolve;
    a.onerror = resolve;
    a.play().catch(resolve);
  });
}
