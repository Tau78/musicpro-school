"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const PNG_PREFIX = "data:image/png;base64,";

export type PayrollSignPadHandle = {
  capture: () => string | null;
  clear: () => void;
  hasInk: () => boolean;
};

type Point = { x: number; y: number };

function stripPngPrefix(dataUrl: string): string {
  if (dataUrl.startsWith(PNG_PREFIX)) return dataUrl.slice(PNG_PREFIX.length);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

type PayrollSignPadProps = {
  disabled?: boolean;
  onCapture?: (pngBase64: string | null) => void;
};

export const PayrollSignPad = forwardRef<
  PayrollSignPadHandle,
  PayrollSignPadProps
>(function PayrollSignPad({ disabled = false, onCapture }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<Point | null>(null);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [padError, setPadError] = useState<string | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#171717";
  }, []);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  const exportPng = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) return null;
    return stripPngPrefix(canvas.toDataURL("image/png"));
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    hasInkRef.current = false;
    setHasInk(false);
    setCaptured(false);
    setPadError(null);
    onCapture?.(null);
  }, [onCapture]);

  useImperativeHandle(
    ref,
    () => ({
      capture: exportPng,
      clear: clearCanvas,
      hasInk: () => hasInkRef.current,
    }),
    [clearCanvas, exportPng],
  );

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFromEvent(event);
    setCaptured(false);
    setPadError(null);
    onCapture?.(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastRef.current;
    if (!canvas || !ctx || !last) return;
    const next = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
    hasInkRef.current = true;
    setHasInk(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  function handleSign() {
    const png = exportPng();
    if (!png) {
      setPadError("Disegna la firma sul riquadro.");
      return;
    }
    setCaptured(true);
    setPadError(null);
    onCapture?.(png);
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-white">
        <canvas
          ref={canvasRef}
          className="block h-44 w-full cursor-crosshair touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      {padError ? (
        <p className="text-sm text-red-700">{padError}</p>
      ) : captured ? (
        <p className="text-sm text-green-800">Firma acquisita.</p>
      ) : (
        <p className="text-sm text-neutral-500">
          Firma nel riquadro con il dito o il mouse.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !hasInk}
          onClick={clearCanvas}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Pulisci
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleSign}
          className="rounded-lg border border-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-50"
        >
          Firma
        </button>
      </div>
    </div>
  );
});
