import { observer } from "mobx-react";
import * as React from "react";
import StoreContext from "../Store/StoreContext";
import styles from "./ActivationOverlay.css";
import { Observation } from "../Learning/types";
import { MAX_SENSING_DISTANCE } from "../Simulation/Vehicle/DistanceSensing";
import { computeActivations, makeInput } from "../Learning/activations";
import { SEQ_LEN, INPUT_BASE_DIM, makeSequenceInputVector } from "../Learning/types";
import { applyInputNormalization } from "../Learning/model";
import * as tf from "@tensorflow/tfjs";

function buildObservation(detections: any[], speedMS: number): Observation {
  const distances = (detections || []).map(d => {
    const dist = d?.distance ?? MAX_SENSING_DISTANCE;
    return Math.max(0, Math.min(1, dist / MAX_SENSING_DISTANCE));
  });
  while (distances.length < 8) distances.push(1);
  const speedKph = speedMS * 3.6;
  // Normalize displayed/training speed with 0..50 km/h range
  const speed = Math.max(0, Math.min(1, speedKph / 50));
  return { distances: distances.slice(0, 8), speed, speedKph };
}

const ActivationOverlay = observer(() => {
  const root = React.useContext(StoreContext);
  const car = root.carStore;
  const learning = root.learningStore;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const bundle = learning.modelBundle;
    const actModel = learning.activationModel;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== W || canvas.height !== H) {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(W * ratio);
      canvas.height = Math.floor(H * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, W, H);

    if (!bundle.model || !actModel) {
      ctx.fillStyle = "#ccd";
      ctx.fillText("No model loaded", 12, 24);
      return;
    }

    // Prepare inputs / activations (temporal stacking)
  const obs = buildObservation(car.detectionResult, car.speedMS);
    obsHistoryRef.current.push(obs);
    if (obsHistoryRef.current.length > SEQ_LEN) {
      obsHistoryRef.current.splice(0, obsHistoryRef.current.length - SEQ_LEN);
    }
    // Choose input builder based on model input shape for backward compatibility
  const inputTensor = Array.isArray(bundle.model.inputs) ? bundle.model.inputs[0] : bundle.model.inputs;
  const shape = (inputTensor as any).shape as number[] | undefined;
  const batchInputShape = ((bundle.model.layers?.[0] as any)?.batchInputShape) as number[] | undefined;
  const rankGuess = (shape?.length ?? batchInputShape?.length ?? 0);
  const isSequenceModel = rankGuess >= 3;
    let x: tf.Tensor;
    if (!isSequenceModel) {
      x = makeInput(obs, bundle.norm);
    } else {
      const flat = makeSequenceInputVector(obsHistoryRef.current, SEQ_LEN);
      x = tf.tensor3d(flat, [1, SEQ_LEN, INPUT_BASE_DIM]);
      x = applyInputNormalization(x, bundle.norm);
    }
    const acts = computeActivations(actModel, x);
    // Read normalized input values for display of the input layer
  const inputValues = Array.from(x.dataSync() as Float32Array) as number[];
    x.dispose();

    // Build layers: input + each dense output
  const layersValues: number[][] = [];
    layersValues.push(inputValues);
    for (const a of acts) layersValues.push(a.values);

    // Layout
    const cols = layersValues.length;
    const leftPad = 20;
    const rightPad = 20;
    const topPad = 20;
    const bottomPad = 20;
    const colW = (W - leftPad - rightPad) / Math.max(1, cols - 1);

    const nodePositions: { x: number; y: number }[][] = [];
    for (let c = 0; c < cols; c++) {
      const vals = layersValues[c];
      const n = vals.length;
      const xPos = leftPad + c * colW;
      const colYPad = 12;
      const availH = H - topPad - bottomPad - 2 * colYPad;
      const gap = n > 1 ? availH / (n - 1) : 0;
      const nodes: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const yPos = topPad + colYPad + i * gap;
        nodes.push({ x: xPos, y: yPos });
      }
      nodePositions.push(nodes);
    }

    // Edges
    if (learning.showActivationEdges) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(200,200,220,0.08)";
      for (let c = 0; c < cols - 1; c++) {
        const from = nodePositions[c];
        const to = nodePositions[c + 1];
        for (let i = 0; i < from.length; i++) {
          for (let j = 0; j < to.length; j++) {
            ctx.beginPath();
            ctx.moveTo(from[i].x, from[i].y);
            ctx.lineTo(to[j].x, to[j].y);
            ctx.stroke();
          }
        }
      }
    }

    // Nodes
    for (let c = 0; c < cols; c++) {
      const vals = layersValues[c];
      const nodes = nodePositions[c];
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        // Map value to color. Inputs are [0,1], hidden/output often [-1,1].
        const mag = isFinite(v) ? Math.max(0, Math.min(1, (v + 1) / 2)) : 0; // [-1,1] -> [0,1]
        const r = 8;
        const hue = 240 - mag * 240; // blue -> red
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.beginPath();
        ctx.arc(nodes[i].x, nodes[i].y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Output labels for last layer (we now display only [Steer, Force])
    if (cols > 1) {
      const outVals = layersValues[cols - 1];
      const outNodes = nodePositions[cols - 1];
      const names = ["Steer", "Force"]; // brake removed from AI pipeline
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.textBaseline = "middle";
      for (let i = 0; i < Math.min(names.length, outVals.length); i++) {
        let v = outVals[i]; // tanh in [-1,1]
        if (names[i] === "Force") {
          v = Math.max(-0.4, Math.min(0.4, v));
        }
        const text = `${names[i]}: ${isFinite(v) ? v.toFixed(2) : "NaN"}`;
        const pt = outNodes[i];
        const ty = pt.y;
        const padding = 3;
        const w = ctx.measureText(text).width;
        // Prefer drawing to the right, but clamp inside canvas; otherwise draw to the left.
        let tx = pt.x + 14;
        const rightLimit = W - 6;
        if (tx + w + padding * 2 > rightLimit) {
          tx = pt.x - 14 - (w + padding * 2);
        }
        const leftLimit = 6;
        if (tx < leftLimit) tx = leftLimit;

        // Background box for readability
        ctx.fillStyle = "rgba(10,10,14,0.6)";
        ctx.fillRect(tx - padding, ty - 8, w + padding * 2, 16);
        ctx.fillStyle = "#eef";
        ctx.fillText(text, tx, ty);
      }
    }
  }, [learning.modelBundle, learning.activationModel, learning.showActivationEdges, car]);

  // Keep a small history of observations for temporal visualization
  const obsHistoryRef = React.useRef<Observation[]>([]);

  React.useEffect(() => {
    if (!learning.showActivationOverlay) return;
    const id = setInterval(draw, 200); // 5 Hz
    draw();
    return () => clearInterval(id);
  }, [learning.showActivationOverlay, draw]);

  if (!learning.showActivationOverlay) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <div>Neural Network</div>
        <div className={styles.controls}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={learning.showActivationEdges}
              onChange={e => learning.setShowActivationEdges(e.target.checked)}
            />
            Edges
          </label>
          <div
            className={styles.button}
            onClick={() => learning.setShowActivationOverlay(false)}
            title="Close"
          >
            ✕
          </div>
        </div>
      </div>
      <div className={styles.content}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </div>
  );
});

export default ActivationOverlay;
