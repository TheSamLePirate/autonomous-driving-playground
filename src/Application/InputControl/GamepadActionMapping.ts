import { CarStore } from "../Store/CarStore";
import {
  getGamepadsSafely,
  registerGamepadAction,
  unregisterGamepadAction
} from "./Gamepad";

const STEERING_AXIS_INDEX = 0; // Left stick X
const THROTTLE_AXIS_INDEX = 1; // Left stick Y (up = -1 on standard mapping)
  const LT_BUTTON_INDEX = 6; // L2
  const RT_BUTTON_INDEX = 7; // R2
  // Some non-standard mappings expose triggers as axes — keep these indices as a fallback only.
  const LT_AXIS_INDEX = 2;
  const RT_AXIS_INDEX = 5;
  const MANUAL_HOLD_MS = 400; // Keep manual mode for this time after last significant change

  let eventsInitialized = false;

  export function setupGamepad(carStore: CarStore) {
    // Attach to already-connected gamepads (e.g., Safari/Chrome after a refresh)
    const pads = getGamepadsSafely();
    for (const gp of pads) {
      if (gp) {
        attachMappingForGamepad(gp, carStore);
      }
    }

    // Initialize connect/disconnect listeners once
    if (!eventsInitialized) {
      window.addEventListener("gamepadconnected", e => {
        const gp = (e as GamepadEvent).gamepad;
        console.info(
          `[Gamepad] connected: index=${gp.index}, id=${gp.id}, mapping=${gp.mapping}`
        );
        attachMappingForGamepad(gp, carStore);
      });
      window.addEventListener("gamepaddisconnected", e => {
        const gp = (e as GamepadEvent).gamepad;
        console.info(`[Gamepad] disconnected: index=${gp.index}, id=${gp.id}`);
        unregisterGamepadAction(gp.index);
      });
      eventsInitialized = true;
    }
  }

  function attachMappingForGamepad(gp: Gamepad, carStore: CarStore) {
    // Helpers to normalize input
    const deadzone = (v: number, dz = 0.05) => (Math.abs(v) < dz ? 0 : v);
    const normTriggerAxis = (v: number) => (v + 1) / 2; // [-1,1] -> [0,1]
    const nearlyEqual = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps;

    // Internal state to combine inputs
    let axisThrottle = 0; // from stick Y (-1..1)
    let ltValue = 0; // 0..1
    let rtValue = 0; // 0..1
    let steerValue = 0; // -1..1
    let lastSentSteer = Number.NaN;
    let lastSentForce = Number.NaN;
  let lastManualActive: boolean | undefined = undefined;
  let lastInputChangeMs = 0;
  let prevSteerInput = 0;
  let prevAxisThrottle = 0;
  let prevLt = 0;
  let prevRt = 0;

    const updateManualFlag = (): boolean => {
      // Manual active only briefly after last significant change
      const now = Date.now();
      const active = now - lastInputChangeMs <= MANUAL_HOLD_MS;
      if (active !== lastManualActive) {
        carStore.setIsManualDriving(active);
        lastManualActive = active;
      }
      return active;
    };

    // Detect mapping profile. For PlayStation controllers on modern browsers, mapping is "standard".
    const isStandard = gp.mapping === "standard";
    const isPlayStation = /playstation|dualsense|dualshock|sony|054c/i.test(gp.id);

    if (isPlayStation) {
      console.info(
        `[Gamepad] Using PlayStation-friendly mapping for gp#${gp.index} (id=${gp.id}, mapping=${gp.mapping})`
      );
    }

    // Pure helper: compute the throttle value combining triggers and left-stick Y
    const computeThrottle = () => {
      const triggerThrottle = rtValue - ltValue; // forward - backward
      const useTrigger = Math.abs(triggerThrottle) > 0.05;
      return useTrigger ? triggerThrottle : axisThrottle;
    };

    const maybeSendSteer = (value: number) => {
      if (!nearlyEqual(value, lastSentSteer)) {
        carStore.setSteering(value);
        lastSentSteer = value;
      }
    };

    const maybeSendForce = (value: number) => {
      if (!nearlyEqual(value, lastSentForce)) {
        carStore.applyForce(value);
        lastSentForce = value;
      }
    };

    // Build buttons map (always prefer triggers as buttons when available — correct for PlayStation)
    const buttonHandlers: Array<[number, (b: GamepadButton) => void]> = [
      [
        LT_BUTTON_INDEX,
        (btn: GamepadButton) => {
          ltValue = btn.value ?? (btn.pressed ? 1 : 0);
          if (!nearlyEqual(ltValue, prevLt) && ltValue > 0.05) {
            lastInputChangeMs = Date.now();
          }
          prevLt = ltValue;
          const manual = updateManualFlag();
          if (manual) {
            carStore.applyForce(computeThrottle());
          }
        }
      ],
      [
        RT_BUTTON_INDEX,
        (btn: GamepadButton) => {
          rtValue = btn.value ?? (btn.pressed ? 1 : 0);
          if (!nearlyEqual(rtValue, prevRt) && rtValue > 0.05) {
            lastInputChangeMs = Date.now();
          }
          prevRt = rtValue;
          const manual = updateManualFlag();
          if (manual) {
            carStore.applyForce(computeThrottle());
          }
        }
      ]
    ];

    // Build axes map. Always register steering and left-stick throttle.
    const axisHandlers: Array<[number, (v: number) => void]> = [
      [
        STEERING_AXIS_INDEX,
        (value: number) => {
          steerValue = deadzone(value);
          if (!nearlyEqual(steerValue, prevSteerInput) && Math.abs(steerValue) > 0.05) {
            lastInputChangeMs = Date.now();
          }
          prevSteerInput = steerValue;
          const manual = updateManualFlag();
          if (manual) {
            maybeSendSteer(steerValue);
          }
        }
      ],
      [
        THROTTLE_AXIS_INDEX,
        (value: number) => {
          // Up is typically -1; invert so up = forward (+)
          axisThrottle = -deadzone(value);
          if (!nearlyEqual(axisThrottle, prevAxisThrottle) && Math.abs(axisThrottle) > 0.05) {
            lastInputChangeMs = Date.now();
          }
          prevAxisThrottle = axisThrottle;
          const manual = updateManualFlag();
          if (manual) {
            maybeSendForce(computeThrottle());
          }
        }
      ]
    ];

    // As a fallback for non-standard mappings, register LT/RT as axes if present.
    // Important: DO NOT add trigger axes for standard mapping (PlayStation) to avoid
    // interfering with right-stick axes which often live at index 2/3/4/5.
    const looksLikeTriggersAsAxes = !isStandard && gp.axes.length >= 6;
    if (looksLikeTriggersAsAxes) {
      axisHandlers.push(
        [
          LT_AXIS_INDEX,
          (value: number) => {
            ltValue = normTriggerAxis(value);
            if (!nearlyEqual(ltValue, prevLt) && ltValue > 0.05) {
              lastInputChangeMs = Date.now();
            }
            prevLt = ltValue;
            const manual = updateManualFlag();
            if (manual) {
              maybeSendForce(computeThrottle());
            }
          }
        ],
        [
          RT_AXIS_INDEX,
          (value: number) => {
            rtValue = normTriggerAxis(value);
            if (!nearlyEqual(rtValue, prevRt) && rtValue > 0.05) {
              lastInputChangeMs = Date.now();
            }
            prevRt = rtValue;
            const manual = updateManualFlag();
            if (manual) {
              maybeSendForce(computeThrottle());
            }
          }
        ]
      );
    }

    registerGamepadAction(gp.index, {
      buttons: new Map(buttonHandlers),
      axes: new Map(axisHandlers)
    });
  }
