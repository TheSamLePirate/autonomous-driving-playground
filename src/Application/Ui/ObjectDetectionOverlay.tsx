import * as React from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./ObjectDetectionOverlay.css";
import { CameraMode, VisualMode } from "../Config/VisualMode";
import { ENABLE_OBJECT_DETECTION } from "../Config/FeatureFlag";
import { getRendererCanvas } from "../Simulation/Simulation";

// Minimal prediction type; coco-ssd exports richer types but keep decoupled here
interface Prediction {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

const SCORE_THRESHOLD = 0.8;
const TARGET_FPS = 20; // run inference ~6 fps to keep perf reasonable

const ObjectDetectionOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastInferRef = useRef<number>(0);

  useEffect(() => {
    let disposed = false;

    // Lazy-load model to avoid bloating initial bundle
    async function loadModel() {
      try {
        const coco = await import("@tensorflow-models/coco-ssd");
        // Use default base; other bases: 'lite_mobilenet_v2' etc.
        modelRef.current = await coco.load({ base: 'lite_mobilenet_v2' });
        if (!disposed) setIsModelReady(true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to load coco-ssd model", e);
      }
    }

    loadModel();

    function loop(ts: number) {
      rafRef.current = requestAnimationFrame(loop);
      // throttle
      const minDt = 1000 / TARGET_FPS;
      if (ts - lastInferRef.current < minDt) return;
      lastInferRef.current = ts;

      if (!ENABLE_OBJECT_DETECTION || !VisualMode.showObjectDetection) {
        const overlay = overlayRef.current;
        if (overlay) {
          const ctx = overlay.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
        }
        return;
      }

      if (!modelRef.current) return;
      const canvas = getRendererCanvas();
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return;

      // Previously restricted to cockpit mode; now run in any camera mode when enabled

      // Match overlay bitmap size to the renderer canvas' backing resolution (accounts for devicePixelRatio)
      // Important: coco-ssd returns bboxes in the source's pixel space (canvas.width/height),
      // so the overlay must use the same coordinate system to align properly.
      const width = canvas.width;
      const height = canvas.height;
      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }

      // Run detection on the rendered canvas
      modelRef.current
        .detect(canvas)
        .then((preds: Prediction[]) => {
          drawPredictions(overlay, preds);
          try {
            const filtered = preds.filter(p => p && p.score >= SCORE_THRESHOLD);
            // Log a concise summary to console
            // Example: {count: 2, items: [{class: 'person', score: 0.86, bbox: [x,y,w,h]}, ...]}
            // eslint-disable-next-line no-console
            // console.log("[ObjectDetection]", {
            //   count: filtered.length,
            //   items: filtered.map(p => ({
            //     class: p.class,
            //     score: Number(p.score.toFixed(2)),
            //     bbox: [
            //       Math.round(p.bbox[0]),
            //       Math.round(p.bbox[1]),
            //       Math.round(p.bbox[2]),
            //       Math.round(p.bbox[3])
            //     ] as [number, number, number, number]
            //   }))
            // });
          } catch {
            // ignore logging issues
          }
        })
        .catch(() => {
          // ignore frame errors
        });
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={overlayRef} className={styles.overlay} aria-hidden />;
};

function drawPredictions(overlay: HTMLCanvasElement, preds: Prediction[]) {
  const ctx = overlay.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const fontSize = Math.max(12, Math.round(overlay.height * 0.02));
  ctx.lineWidth = 2;
  ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system`;

  preds.forEach(p => {
    if (!p || !p.bbox || p.score < SCORE_THRESHOLD) return;
    if (p.class === "Airplane" || p.class === "airplane") return;
    const [x, y, w, h] = p.bbox;

    // Box
    ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
    ctx.fillStyle = "rgba(0, 200, 255, 0.15)";
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    // Label background
    const label = `${p.class} ${(p.score * 100).toFixed(0)}%`;
    const metrics = ctx.measureText(label);
    const padding = 4;
    const labelW = metrics.width + padding * 2;
    const labelH = fontSize + padding * 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(x, Math.max(0, y - labelH), labelW, labelH);

    // Label text
    ctx.fillStyle = "#e6faff";
    ctx.fillText(label, x + padding, Math.max(fontSize + padding, y - padding));
  });
}

export default ObjectDetectionOverlay;
