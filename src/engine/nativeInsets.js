export const INSET_FITTED_ANDROID_VERSION = 336;

export function usesFittedNativeViewport(versionCode) {
  const code = Number(versionCode);
  return Number.isSafeInteger(code) && code >= INSET_FITTED_ANDROID_VERSION;
}

export function installNativeInsets(root, { native, readVersionCode }) {
  let active = true;
  const clear = () => root.classList.remove('native-legacy-insets', 'native-fitted-insets');
  clear();
  if (native) {
    // Older APKs report zero CSS safe-area insets; reserve space until the APK is identified.
    root.classList.add('native-legacy-insets');
    Promise.resolve().then(readVersionCode).then(({ versionCode }) => {
      if (active && usesFittedNativeViewport(versionCode)) {
        root.classList.replace('native-legacy-insets', 'native-fitted-insets');
      }
    }).catch(() => { /* Keep the conservative OTA fallback when the native bridge is unavailable. */ });
  }
  return () => { active = false; clear(); };
}
