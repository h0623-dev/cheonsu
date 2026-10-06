const VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;

export function validateReleaseNotes(document, expectedVersion) {
  if (typeof expectedVersion !== 'string' || !VERSION.test(expectedVersion)) {
    throw new Error('릴리스 버전 형식이 올바르지 않습니다.');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.version !== expectedVersion) {
    throw new Error(`docs/update-notes.json에 현재 버전 ${expectedVersion}의 패치 노트가 필요합니다.`);
  }
  if (!Array.isArray(document.notes) || document.notes.length < 1 || document.notes.length > 8) {
    throw new Error('패치 노트는 1~8개 문자열이어야 합니다.');
  }
  for (const note of document.notes) {
    if (typeof note !== 'string' || note.length > 400) {
      throw new Error('각 패치 노트는 400자 이하의 문자열이어야 합니다.');
    }
  }
  return document.notes.slice();
}
