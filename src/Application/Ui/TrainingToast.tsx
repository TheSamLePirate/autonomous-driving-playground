import { observer } from "mobx-react";
import * as React from "react";
import StoreContext from "../Store/StoreContext";
import styles from "./TrainingToast.css";

const TrainingToast = observer(() => {
  const root = React.useContext(StoreContext);
  const learning = root.learningStore;

  const p = learning.lastProgress;
  const [stablePct, setStablePct] = React.useState(0);
  React.useEffect(() => {
    if (learning.training) {
      // Reset when a new training session starts
      setStablePct(0);
    }
  }, [learning.training]);
  React.useEffect(() => {
    if (!learning.training) return;
    const current = Math.max(0, Math.min(100, Math.round(((p?.percent ?? 0) * 100))));
    setStablePct(prev => (current >= prev ? current : prev));
  }, [learning.training, p?.percent]);

  if (!learning.training) return null;

  return (
    <div className={styles.container}>
      <div className={styles.label}>Training</div>
      <div className={styles.barBg}>
        <div className={styles.bar} style={{ width: `${stablePct}%` }} />
      </div>
      <div className={styles.value}>{stablePct}%</div>
    </div>
  );
});

export default TrainingToast;
