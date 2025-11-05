import { observer } from "mobx-react";
import * as React from "react";
import * as tf from "@tensorflow/tfjs";
import StoreContext from "../../Store/StoreContext";
import { Observation, SEQ_LEN, INPUT_BASE_DIM, makeSequenceInputVector } from "../../Learning/types";
import { MAX_SENSING_DISTANCE } from "../../Simulation/Vehicle/DistanceSensing";
import { makeInput, computeActivations, LayerActivation } from "../../Learning/activations";
import { applyInputNormalization } from "../../Learning/model";
import Toggle from "react-toggle";
import styles from "./ActivationPanel.css";

function buildObservation(detections: any[], speedMS: number): Observation {
  const distances = (detections || []).map(d => {
    const dist = d?.distance ?? MAX_SENSING_DISTANCE;
    return Math.max(0, Math.min(1, dist / MAX_SENSING_DISTANCE));
  });
  while (distances.length < 8) distances.push(1);
  const speedKph = speedMS * 3.6;
  // Normalize to 0..50 km/h
  const speed = Math.max(0, Math.min(1, speedKph / 50));
  return { distances: distances.slice(0, 8), speed, speedKph };
}

const ActivationPanel = observer(() => {
  const root = React.useContext(StoreContext);
  const car = root.carStore;
  const learning = root.learningStore;

  const [layers, setLayers] = React.useState<LayerActivation[]>([]);
  const obsHistoryRef = React.useRef<Observation[]>([]);

  React.useEffect(() => {
    if (!learning.activationsEnabled) return;
    let cancelled = false;

    const tick = async () => {
      const bundle = learning.modelBundle;
      const actModel = learning.activationModel;
      if (bundle.model && actModel) {
  const obs = buildObservation(car.detectionResult, car.speedMS);
        obsHistoryRef.current.push(obs);
        if (obsHistoryRef.current.length > SEQ_LEN) {
          obsHistoryRef.current.splice(0, obsHistoryRef.current.length - SEQ_LEN);
        }
        // Detect model input rank (2D legacy vs 3D sequence)
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
          if (!cancelled) setLayers(acts);
        } finally {
          x.dispose();
        }
      } else {
        setLayers([]);
      }
    };

    const interval = setInterval(tick, 200); // 5 Hz
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [learning.activationsEnabled, learning.modelBundle.model, learning.modelBundle.norm, learning.activationModel, car]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>Network Activations</div>
        <Toggle
          icons={false}
          checked={learning.activationsEnabled}
          onChange={() => learning.setActivationsEnabled(!learning.activationsEnabled)}
        />
      </div>
      {!learning.activationsEnabled ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>Disabled</div>
      ) : null}
      {learning.activationsEnabled && layers.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>No model loaded</div>
      ) : null}
      {learning.activationsEnabled && layers.map((l, idx) => (
        <div key={idx} className={styles.layer}>
          <div className={styles.layerTitle}>{l.name} · {l.values.length} neurons</div>
          <div className={styles.bars}>
            {l.values.map((v, i) => {
              // v is typically in [0,1] for relu, [-1,1] for tanh: map to [0,1]
              const mag = isFinite(v) ? Math.max(0, Math.min(1, (v + 1) / 2)) : 0;
              const height = 10 + mag * 50; // 10..60 px
              const hue = 240 - mag * 240; // blue -> red
              return (
                <div
                  key={i}
                  className={styles.bar}
                  style={{ height, backgroundColor: `hsl(${hue}, 80%, 50%)` }}
                  title={v.toFixed(3)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

export default ActivationPanel;
