export const DEFAULT_UPDATE_MANIFEST_URL = "/updates/latest.json";

function parseVersion(version) {
  return String(version || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(nextVersion, currentVersion) {
  const next = parseVersion(nextVersion);
  const current = parseVersion(currentVersion);
  const length = Math.max(next.length, current.length, 3);

  for (let index = 0; index < length; index += 1) {
    const nextPart = next[index] || 0;
    const currentPart = current[index] || 0;

    if (nextPart > currentPart) return 1;
    if (nextPart < currentPart) return -1;
  }

  return 0;
}

export function normalizeUpdateManifest(raw) {
  const manifest = raw && typeof raw === "object" ? raw : {};
  const version = String(manifest.version || "").trim();

  if (!version) {
    throw new Error("업데이트 정보에 version이 없습니다.");
  }

  return {
    version,
    versionCode: Number.isFinite(Number(manifest.versionCode)) ? Number(manifest.versionCode) : null,
    title: String(manifest.title || `천수 v${version}`).trim(),
    releasedAt: String(manifest.releasedAt || "").trim(),
    apkUrl: String(manifest.apkUrl || manifest.downloadUrl || "").trim(),
    apkFileName: String(manifest.apkFileName || "").trim(),
    required: Boolean(manifest.required),
    notes: Array.isArray(manifest.notes)
      ? manifest.notes.map((note) => String(note)).filter(Boolean).slice(0, 8)
      : [],
  };
}

export async function fetchUpdateManifest(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`업데이트 정보를 불러오지 못했습니다. (${response.status})`);
  }

  return normalizeUpdateManifest(await response.json());
}
