export const ENABLE_CODE_EDITOR = isEnableCodeEditor();
export const ENABLE_DEPLOY = true;
export const ENABLE_TIMER = false;
export const ENABLE_OBJECT_DETECTION = isEnableObjectDetection();

function isEnableDeploy(): boolean {
  const queryInput = getBooleanQueryParam(
    "ENABLE_DEPLOY",
    window.location.search
  );
  if (queryInput === undefined) {
    return false;
  }
  return queryInput;
}

function isEnableCodeEditor(): boolean {
  const queryInput = getBooleanQueryParam(
    "ENABLE_CODE_EDITOR",
    window.location.search
  );
  if (queryInput === undefined) {
    return false;
  }
  return queryInput;
}

function getBooleanQueryParam(paramName: string, queryString: string) {
  const urlParams = new URLSearchParams(queryString);
  const paramValue = urlParams.get(paramName);

  if (paramValue === null) {
    return undefined;
  }

  return paramValue === "true";
}

function isEnableObjectDetection(): boolean {
  const queryInput = getBooleanQueryParam(
    "ENABLE_OBJECT_DETECTION",
    window.location.search
  );
  if (queryInput === undefined) {
    return true; // enabled by default
  }
  return queryInput;
}
