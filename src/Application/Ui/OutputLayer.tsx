import { observer } from "mobx-react";
import * as React from "react";
import StoreContext from "../Store/StoreContext";
import styles from "./OutputLayer.css";
import glass from "./GlassPanels.css";
import { Observation, SEQ_LEN, INPUT_BASE_DIM, makeSequenceInputVector } from "../Learning/types";
import { MAX_SENSING_DISTANCE } from "../Simulation/Vehicle/DistanceSensing";
import { makeInput, computeActivations } from "../Learning/activations";
import { applyInputNormalization } from "../Learning/model";
import * as tf from "@tensorflow/tfjs";

function buildObservation(detections: any[], speedMS: number): Observation {
  const distances = (detections || []).map(d => {
    const dist = d?.distance ?? MAX_SENSING_DISTANCE;
    return Math.max(0, Math.min(1, dist / MAX_SENSING_DISTANCE));
  });
  while (distances.length < 8) distances.push(1);
  const speedKph = speedMS * 3.6;
  const speed = Math.max(0, Math.min(1, speedKph / 50));
  return { distances: distances.slice(0, 8), speed, speedKph };
}

const OutputLayer = observer(() => {
  const root = React.useContext(StoreContext);
  const car = root.carStore;
  const learning = root.learningStore;

  const [out, setOut] = React.useState<number[] | null>(null);
  const obsHistoryRef = React.useRef<Observation[]>([]);

  React.useEffect(() => {
    let id: any;
    const tick = () => {
      const bundle = learning.modelBundle;
      const actModel = learning.activationModel;
      if (!bundle.model || !actModel) {
        setOut(null);
        return;
      }
  const obs = buildObservation(car.detectionResult, car.speedMS);
      obsHistoryRef.current.push(obs);
      if (obsHistoryRef.current.length > SEQ_LEN) {
        obsHistoryRef.current.splice(0, obsHistoryRef.current.length - SEQ_LEN);
      }
      // Detect expected input rank to choose 2D vs 3D
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
      try {
        const acts = computeActivations(actModel, x);
        if (acts.length > 0) {
          const last = acts[acts.length - 1];
          // Only keep first two outputs [Steer, Force]
          setOut(last.values.slice(0, 2));
        }
      } finally {
        x.dispose();
      }
    };
    id = setInterval(tick, 150);
    tick();
    return () => clearInterval(id);
  }, [learning.modelBundle.model, learning.modelBundle.norm, learning.activationModel, car]);

  const formatPct = (v: number) => {
    // v in [-1,1] -> 0..100
    const pct = Math.round(((v + 1) / 2) * 100);
    return `${pct}%`;
  };

  const rows = [
    { key: "Steer", idx: 0 },
    { key: "Force", idx: 1 }
  ];

  return (
    <div className={`${glass.darkPanel} ${styles.container}`}>
      <div className={styles.title}>Model Output</div>
      {!out ? (
        <div className={styles.small}>No model loaded</div>
      ) : (
        rows.map(r => {
          let v = out[r.idx]; // tanh in [-1,1]
          if (r.key === "Force") {
            // Display force capped to 0.4 magnitude
            v = Math.max(-0.4, Math.min(0.4, v));
          }
          const mag = Math.max(0, Math.min(1, (v + 1) / 2));
          return (
            <div key={r.key} className={styles.row}>
              <div className={styles.small}>{r.key}</div>
              <div className={styles.barBg}>
                <div className={styles.bar} style={{ width: `${mag * 100}%` }} />
              </div>
              <div className={styles.small}>{v.toFixed(2)}</div>
            </div>
          );
        })
      )}
    </div>
  );
});

export default OutputLayer;
