import * as React from "react";
import highResImage from "../Assets/Images/model3-high-res.png";
import lowResImage from "../Assets/Images/model3-low-res.png";
import { ModelQuality } from "../Store/ApplicationStore";
import StoreContext from "../Store/StoreContext";
import glassStyles from "./GlassPanels.css";
import styles from "./ModelSelection.css";
import { TrackId, TrackLabels } from "../Config/TrackConfig";

const ModelSelection = () => {
  const rootStore = React.useContext(StoreContext);
  const appStore = rootStore.applicationStore;

  return (
    <React.Fragment>
      <div className={`${glassStyles.darkPanel} ${styles.modelSelectionPanel}`}>
        <div className={styles.title}>Display Option</div>
        <div className={styles.column}>
          <div
            className={styles.option}
            onClick={() => {
              appStore.setModelQuality(ModelQuality.LOW);
            }}
          >
            <img src={lowResImage} />
            <div>Fast Loading</div>
          </div>
          <div
            className={styles.option}
            onClick={() => {
              appStore.setModelQuality(ModelQuality.HIGH);
            }}
          >
            <img src={highResImage} />
            <div>High Quality</div>
          </div>
        </div>
        <div className={styles.title} style={{ marginTop: 16 }}>
          Track Selection
        </div>
        <div className={styles.column}>
          <div
            className={styles.option}
            onClick={() => appStore.setTrackId(TrackId.SIMPLE)}
          >
            <div>{TrackLabels[TrackId.SIMPLE]}</div>
          </div>
          <div
            className={styles.option}
            onClick={() => appStore.setTrackId(TrackId.COMPLEX)}
          >
            <div>{TrackLabels[TrackId.COMPLEX]}</div>
          </div>
          <div
            className={styles.option}
            onClick={() => appStore.setTrackId(TrackId.EXTREME)}
          >
            <div>{TrackLabels[TrackId.EXTREME]}</div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

export default ModelSelection;
