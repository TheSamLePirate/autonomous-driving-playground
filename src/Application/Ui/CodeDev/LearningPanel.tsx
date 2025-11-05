import { observer } from "mobx-react";
import * as React from "react";
import Toggle from "react-toggle";
import StoreContext from "../../Store/StoreContext";
import styles from "./LearningPanel.css";

const LearningPanel = observer(() => {
  const root = React.useContext(StoreContext);
  const learning = root.learningStore;

  const [epochs, setEpochs] = React.useState(10);
  const [batch, setBatch] = React.useState(64);

  const size = learning.dataset.size();

  const startHuman = () => learning.setRecording(learning.recording === "human" ? "off" : "human");
  const startExpert = () => learning.setRecording(learning.recording === "expert" ? "off" : "expert");
  const clear = () => learning.clearDataset();
  const exportDs = () => {
    const blob = new Blob([learning.exportDataset()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "driving-dataset.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importDs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const txt = await file.text();
    learning.importDataset(txt);
  };

  const train = async () => {
    await learning.train({ epochs, batchSize: batch });
  };

  const save = async () => {
    await learning.saveModel();
  };

  const load = async () => {
    await learning.loadModel();
  };

  return (
    <div className={styles.container}>
      {/* Row 1: Title + dataset size */}
      <div className={styles.row}>
        <div className={styles.title}>Learning</div>
        <div>Dataset: {size} samples</div>
      </div>

      {/* Row 2: Recording controls */}
      <div className={styles.row}>
        <button onClick={startHuman}>
          {learning.recording === "human" ? "Stop" : "Record Human"}
        </button>
        <button onClick={startExpert}>
          {learning.recording === "expert" ? "Stop" : "Record Expert"}
        </button>
        <button onClick={clear}>Clear</button>
      </div>

      {/* Row 3: Dataset import/export + model save/load + toggle */}
      <div className={styles.row}>
        <button onClick={exportDs}>Export</button>
        <label>
          Import <input type="file" accept="application/json" onChange={importDs} />
        </label>
        <span className={styles.spacer} />
        <button onClick={save} disabled={!learning.modelBundle.model}>Save Model</button>
        <button onClick={load}>Load Model</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div>Use Model</div>
          <Toggle
            icons={false}
            checked={learning.autopilotSource === "model"}
            onChange={() =>
              learning.setAutopilotSource(
                learning.autopilotSource === "model" ? "code" : "model"
              )
            }
          />
        </div>
      </div>

      {/* Row 4: Training controls + progress + (optional) loss graph */}
      <div className={styles.row}>
        <label>
          epochs
          <input
            type="number"
            min={1}
            max={200}
            value={epochs}
            onChange={e => setEpochs(parseInt(e.target.value || "0", 10))}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
        <label>
          batch
          <input
            type="number"
            min={8}
            max={1024}
            step={8}
            value={batch}
            onChange={e => setBatch(parseInt(e.target.value || "0", 10))}
            style={{ width: 60, marginLeft: 4 }}
          />
        </label>
        <button disabled={learning.training || size < batch} onClick={train}>
          {learning.training ? "Training..." : "Train"}
        </button>
        {learning.lastProgress ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div>
              loss {learning.lastProgress.trainLoss?.toFixed(4)}
              {learning.lastProgress.valLoss ? ` / val ${learning.lastProgress.valLoss.toFixed(4)}` : ""}
            </div>
            {typeof learning.lastProgress.percent === "number" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 160 }}>
                <div style={{ width: 100, height: 8, background: "rgba(255,255,255,0.12)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(learning.lastProgress.percent * 100)}%`, height: "100%", background: "#4caf50" }} />
                </div>
                <div style={{ width: 40, textAlign: "right" }}>
                  {Math.round(learning.lastProgress.percent * 100)}%
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Loss graph (per-epoch) */}
        {learning.lossHistory.length > 0 ? (
          <div style={{ flexBasis: "100%" }}>
            <LossGraph
              points={learning.lossHistory.map(p => ({ x: p.epoch, y: p.trainLoss }))}
              valPoints={learning.lossHistory.map(p => ({ x: p.epoch, y: p.valLoss ?? NaN }))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default LearningPanel;

interface Pt { x: number; y: number }
const LossGraph = ({ points, valPoints }: { points: Pt[]; valPoints: Pt[] }) => {
  const W = 320;
  const H = 120;
  const pad = 24;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y).filter(v => isFinite(v));
  const ysVal = valPoints.map(p => p.y).filter(v => isFinite(v));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yAll = [...ys, ...ysVal].filter(v => isFinite(v));
  const yMin = Math.min(...yAll);
  const yMax = Math.max(...yAll);
  const xScale = (x: number) => pad + ((x - xMin) / Math.max(1e-6, xMax - xMin)) * (W - 2 * pad);
  const yScale = (y: number) => H - pad - ((y - yMin) / Math.max(1e-6, yMax - yMin)) * (H - 2 * pad);
  const toPolyline = (pts: Pt[]) => pts.filter(p => isFinite(p.y)).map(p => `${xScale(p.x)},${yScale(p.y)}`).join(" ");
  return (
    <div style={{ paddingTop: 6 }}>
      <svg width={W} height={H}>
        <rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.04)" />
        <polyline points={toPolyline(points)} fill="none" stroke="#4caf50" strokeWidth={2} />
        <polyline points={toPolyline(valPoints)} fill="none" stroke="#ff9800" strokeWidth={2} />
        <text x={pad} y={14} fill="#ccd" fontSize={11}>loss (train: green, val: orange)</text>
      </svg>
    </div>
  );
};
