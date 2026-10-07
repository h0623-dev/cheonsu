import { useEffect, useState } from 'react';
import './legal-notices.css';

const documents = [
  { id: 'rights', title: '제작 및 권리 안내', path: '/legal/RIGHTS.txt' },
  { id: 'npm', title: '외부 라이브러리', path: '/legal/npm/THIRD_PARTY_NOTICES.txt' },
  { id: 'bundle', title: '웹 실행 코드 고지', path: '/legal/bundled-web-notices.md' },
  { id: 'android', title: 'Android 라이브러리', path: '/legal/android/generated/NOTICES.txt', fallback: '/legal/android/README.txt' },
  { id: 'music', title: '음악과 악기 음색', path: '/audio/orchestra-v1/CREDITS.txt' },
  { id: 'brand', title: 'Google 로고', path: '/brand/NOTICE.txt' },
];

function DocumentText({ document }) {
  const [result, setResult] = useState({ text: '', error: false });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function read() {
      try {
        let response = await fetch(document.path, { signal: controller.signal });
        if (document.fallback && (!response.ok || response.headers.get('content-type')?.includes('text/html'))) {
          response = await fetch(document.fallback, { signal: controller.signal });
        }
        if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error('고지 파일 읽기 실패');
        const text = await response.text();
        if (active) setResult({ text, error: false });
      } catch {
        if (active) setResult({ text: '안내를 불러오지 못했습니다. 게임을 다시 열거나 최신 앱으로 업데이트해 주세요.', error: true });
      }
    }
    void read();
    return () => { active = false; controller.abort(); };
  }, [document]);
  return <div className="legal-document" aria-busy={!result.text}>
    <h3>{document.title}</h3>
    {!result.text || result.error ? <p role="status">{result.text || '안내를 불러오는 중…'}</p> : <pre tabIndex={0} aria-label={document.title}>{result.text}</pre>}
  </div>;
}

export default function LegalNotices() {
  const [selected, setSelected] = useState(documents[0]);
  return <section className="legal-notices" aria-label="저작권과 라이선스">
    <h2>저작권과 라이선스</h2>
    <p>천수의 제작 안내와 외부 자료의 출처·이용 조건입니다. 라이선스 전문은 원문으로 제공합니다.</p>
    <div className="legal-document-list" aria-label="안내 문서">
      {documents.map(document => <button key={document.id} aria-pressed={selected.id === document.id} onClick={() => setSelected(document)}>{document.title}</button>)}
    </div>
    <DocumentText key={selected.id} document={selected}/>
  </section>;
}
