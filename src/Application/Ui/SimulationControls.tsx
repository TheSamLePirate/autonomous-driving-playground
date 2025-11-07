import * as React from "react";
import StoreContext from "../Store/StoreContext";
import Reset from "../Assets/Images/reset-icon.svg";
import { reset } from "../Simulation/Simulation";
import styles from "./SimulationControls.css";
import { VisualMode } from "../Config/VisualMode";

const SimulationControls = () => {
  const root = React.useContext(StoreContext);
  const learning = root.learningStore;
  return (
    <div className={styles.container}>
      <div className={styles.item} onClick={reset}>
        <Reset className={styles.icon} />
        Reset
      </div>
      <div
        className={styles.item}
        onClick={() => learning.setShowActivationOverlay(!learning.showActivationOverlay)}
      >
        NN Activations
      </div>
      <div
        className={styles.item}
        onClick={() => {
          VisualMode.showObjectDetection = !VisualMode.showObjectDetection;
        }}
        title="Toggle TensorFlow.js object detection overlay"
      >
        Object Detection 
      </div>
    </div>
  );
};

export default SimulationControls;
