"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { looksLikeGS1 } from "@/lib/gs1";

/** The browser-native detector, where it exists (Android Chrome, newer Safari). */
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

// 1D retail codes carry only a product identifier. The 2D ones can also carry
// GS1 element strings, which is where a use-by date comes from when there is one.
const PRODUCT_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "itf",
  "data_matrix",
  "qr_code",
];

export type ScannerStatus =
  | "idle"
  | "starting"
  | "running"
  | "denied"
  | "insecure"
  | "unavailable"
  | "error";

export type ScannerState = {
  status: ScannerStatus;
  error: string | null;
  torchOn: boolean;
  torchAvailable: boolean;
};

/**
 * Drives the camera and hands back barcodes. Native BarcodeDetector is used when
 * the browser has it; otherwise ZXing is loaded on demand so iOS Safari works
 * too, without paying for the library everywhere else.
 */
export function useBarcodeScanner({
  videoRef,
  active,
  onDetect,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetect: (barcode: string) => void;
}) {
  const [state, setState] = useState<ScannerState>({
    status: "idle",
    error: null,
    torchOn: false,
    torchAvailable: false,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);

  // Held in a ref so a new callback identity doesn't tear the camera down and
  // restart it. Declared before the camera effect so it's current by the time
  // the first frame is decoded.
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // Ignore repeats of the same code for a moment — one barcode in view produces
  // dozens of reads a second.
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const emit = useCallback((raw: string) => {
    // Don't strip whitespace: GS1 element strings can legitimately contain it
    // inside a lot number. Only trim the ends.
    const value = raw.trim();
    const isPlainBarcode = /^\d{6,14}$/.test(value);
    if (!isPlainBarcode && !looksLikeGS1(value)) return;

    const now = Date.now();
    if (lastRef.current.value === value && now - lastRef.current.at < 2500) return;
    lastRef.current = { value, at: now };
    onDetectRef.current(value);
  }, []);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function start() {
      if (typeof window === "undefined") return;

      if (!window.isSecureContext) {
        setState((s) => ({
          ...s,
          status: "insecure",
          error:
            "Your browser only allows the camera over a secure (https) connection.",
        }));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((s) => ({ ...s, status: "unavailable", error: "No camera here." }));
        return;
      }

      setState((s) => ({ ...s, status: "starting", error: null }));

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (error) {
        if (cancelled) return;
        const name = (error as DOMException)?.name;
        setState((s) => ({
          ...s,
          status: name === "NotAllowedError" ? "denied" : "error",
          error:
            name === "NotAllowedError"
              ? "Camera access was blocked."
              : name === "NotFoundError"
                ? "No camera found on this device."
                : "The camera couldn't be started.",
        }));
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = (track?.getCapabilities?.() ?? {}) as {
        torch?: boolean;
      };

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;

      if (Detector) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* autoplay can reject silently; the frame loop still works */
        }
        if (cancelled) return;

        const detector = new Detector({ formats: PRODUCT_FORMATS });
        let raf = 0;
        let busy = false;

        const tick = async () => {
          raf = requestAnimationFrame(tick);
          if (busy || video.readyState < 2) return;
          busy = true;
          try {
            const results = await detector.detect(video);
            if (results.length > 0) emit(results[0].rawValue);
          } catch {
            /* transient decode failures are normal */
          } finally {
            busy = false;
          }
        };
        raf = requestAnimationFrame(tick);

        stopFnRef.current = () => cancelAnimationFrame(raf);
      } else {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
        });
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) emit(result.getText());
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        stopFnRef.current = () => controls.stop();
      }

      if (cancelled) return;
      setState((s) => ({
        ...s,
        status: "running",
        error: null,
        torchAvailable: Boolean(capabilities.torch),
      }));
    }

    void start();

    const videoEl = videoRef.current;

    return () => {
      cancelled = true;
      stopFnRef.current?.();
      stopFnRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      setState({
        status: "idle",
        error: null,
        torchOn: false,
        torchAvailable: false,
      });
    };
  }, [active, emit, videoRef]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !state.torchOn;
    try {
      await track.applyConstraints({
        // `torch` is real on mobile but not in the TS DOM lib yet.
        advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[],
      });
      setState((s) => ({ ...s, torchOn: next }));
    } catch {
      setState((s) => ({ ...s, torchAvailable: false }));
    }
  }, [state.torchOn]);

  return { ...state, toggleTorch };
}

/** A short blip plus a buzz, so you know it worked without looking. */
export function scanFeedback() {
  try {
    navigator.vibrate?.(45);
  } catch {
    /* not supported */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1180;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.13);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio is a nicety, never a failure */
  }
}
