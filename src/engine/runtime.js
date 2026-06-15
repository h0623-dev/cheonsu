export function isNativeCapacitorRuntime() {
  if (typeof window === "undefined") return false;
  const cap = window.Capacitor;
  if (!cap) return false;

  if (typeof cap.isNativePlatform === "function") {
    return cap.isNativePlatform();
  }

  return typeof cap.platform === "string" && cap.platform !== "web";
}

export function requestNativeAppExit() {
  if (!isNativeCapacitorRuntime()) return false;

  const capacitorExit = window?.Capacitor?.Plugins?.App?.exitApp;
  if (typeof capacitorExit === "function") {
    capacitorExit();
    return true;
  }

  const cordovaExit = navigator?.app?.exitApp;
  if (typeof cordovaExit === "function") {
    cordovaExit();
    return true;
  }

  return false;
}
