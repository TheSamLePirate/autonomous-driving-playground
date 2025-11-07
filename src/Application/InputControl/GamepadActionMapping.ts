import { CarStore } from "../Store/CarStore";
import {
  getGamepadsSafely,
  registerGamepadAction,
  unregisterGamepadAction
} from "./Gamepad";

const STEERING_AXIS_INDEX = 0; // Left stick X
const THROTTLE_AXIS_INDEX = 1; // Left stick Y (up = -1 on standard mapping)
// Standard mapping (incl. PlayStation DualShock/DualSense): L2/R2 are buttons 6/7 with analog value in [0,1]
const LT_BUTTON_INDEX = 6; // L2
const RT_BUTTON_INDEX = 7; // R2
// Some non-standard mappings expose triggers as axes — keep these indices as a fallback only.
const LT_AXIS_INDEX = 2;
const RT_AXIS_INDEX = 5;

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
  const deadzone = (v: number, dz = 0.08) => (Math.abs(v) < dz ? 0 : v);
  const normTriggerAxis = (v: number) => (v + 1) / 2; // [-1,1] -> [0,1]

  // Internal state to combine inputs
  let axisThrottle = 0; // from stick Y (-1..1)
  let ltValue = 0; // 0..1
  let rtValue = 0; // 0..1
  let steerValue = 0; // -1..1

  const updateManualFlag = () => {
    // Consider any meaningful input as manual driving
    
    const active =
      Math.abs(steerValue) > 0.05 ||
      Math.abs(axisThrottle) > 0.05 ||
      ltValue > 0.05 ||
      rtValue > 0.05;

    carStore.setIsManualDriving(active);
  };

  // Detect mapping profile. For PlayStation controllers on modern browsers, mapping is "standard".
  const isStandard = gp.mapping === "standard";
  const isPlayStation = /playstation|dualsense|dualshock|sony|054c/i.test(gp.id);

  if (isPlayStation) {
    console.info(
      `[Gamepad] Using PlayStation-friendly mapping for gp#${gp.index} (id=${gp.id}, mapping=${gp.mapping})`
    );
  }

  const applyThrottle = () => {
    // Prefer triggers if used; fall back to left stick Y
    const triggerThrottle = rtValue - ltValue; // forward - backward
    const useTrigger = Math.abs(triggerThrottle) > 0.05;
    const value = useTrigger ? triggerThrottle : axisThrottle;
    
  
    
    
    carStore.applyForce(value);
    updateManualFlag();
  };

  // Build buttons map (always prefer triggers as buttons when available — correct for PlayStation)
  const buttonHandlers: Array<[number, (b: GamepadButton) => void]> = [
    [
      LT_BUTTON_INDEX,
      btn => {
        ltValue = btn.value ?? (btn.pressed ? 1 : 0);
        applyThrottle();
      }
    ],
    [
      RT_BUTTON_INDEX,
      btn => {
        rtValue = btn.value ?? (btn.pressed ? 1 : 0);
        applyThrottle();
      }
    ]
  ];

  // Build axes map. Always register steering and left-stick throttle.
  const axisHandlers: Array<[number, (v: number) => void]> = [
    [
      STEERING_AXIS_INDEX,
      value => {
        steerValue = deadzone(value);
        
        carStore.setSteering(steerValue);
        

        updateManualFlag();
      }
    ],
    [
      THROTTLE_AXIS_INDEX,
      value => {
        // Up is typically -1; invert so up = forward (+)
        axisThrottle = -deadzone(value);
        
        applyThrottle();
        
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
        value => {
          ltValue = normTriggerAxis(value);
          applyThrottle();
        }
      ],
      [
        RT_AXIS_INDEX,
        value => {
          rtValue = normTriggerAxis(value);
          applyThrottle();
        }
      ]
    );
  }

  registerGamepadAction(gp.index, {
    buttons: new Map(buttonHandlers),
    axes: new Map(axisHandlers)
  });
}
