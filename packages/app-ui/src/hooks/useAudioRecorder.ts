import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'stopped';

interface UseAudioRecorderResult {
  state: RecorderState;
  peakLevel: number;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

const MAX_RECORD_MS = 60_000;

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>('idle');
  const [peakLevel, setPeakLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    setPeakLevel(0);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function updatePeak() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const max = Math.max(...dataArray);
        setPeakLevel(max / 255);
        animationRef.current = requestAnimationFrame(updatePeak);
      }
      updatePeak();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setState('stopped');
        cleanup();
      };

      recorder.start(250);
      setState('recording');

      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORD_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as DOMException).name === 'NotAllowedError') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
      } else {
        setError(msg);
      }
      setState('idle');
    }
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { state, peakLevel, audioBlob, error, startRecording, stopRecording };
}
