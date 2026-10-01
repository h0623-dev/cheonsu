import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountConfigured } from '../src/engine/accountEngine.js';

export function getPlayReleaseIssues(root, env = process.env) {
  const issues = [];
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const config = read('src/data/accountConfig.json');
  const https = value => { try { const u = new URL(value); return u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname); } catch { return false; } };
  if (!accountConfigured(config)) issues.push('Firebase 프로젝트의 공개 앱 설정과 enabled=true가 필요합니다.');
  for (const key of ['privacyUrl', 'deletionUrl']) if (!https(config[key])) issues.push(`${key}: 공개 HTTPS URL이 필요합니다.`);
  if (!config.operatorName?.trim()) issues.push('개인정보 처리 주체(operatorName)를 지정하세요.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail || '')) issues.push('지원 및 계정 삭제 연락처(supportEmail)를 지정하세요.');
  const servicesPath = path.join(root, 'android/app/google-services.json');
  if (!fs.existsSync(servicesPath)) issues.push('android/app/google-services.json이 없습니다.');
  else {
    try {
      const services = JSON.parse(fs.readFileSync(servicesPath));
      const client = services.client?.find(entry => entry.client_info?.android_client_info?.package_name === 'com.cheonsu.game');
      if (!client || services.project_info?.project_id !== config.firebase.projectId) issues.push('Firebase Android 패키지/프로젝트가 웹 설정과 일치하지 않습니다.');
      if (!client?.oauth_client?.some(entry => entry.client_type === 3 && entry.client_id)) issues.push('Google 로그인용 웹 OAuth 클라이언트가 누락되었습니다.');
    } catch { issues.push('google-services.json을 파싱할 수 없습니다.'); }
  }
  for (const key of ['CHEONSU_UPLOAD_KEYSTORE', 'CHEONSU_UPLOAD_STORE_PASSWORD', 'CHEONSU_UPLOAD_KEY_ALIAS', 'CHEONSU_UPLOAD_KEY_PASSWORD']) {
    if (!env[key]) issues.push(`${key} 환경변수가 필요합니다. 값은 소스에 넣지 마세요.`);
  }
  if (env.CHEONSU_UPLOAD_KEYSTORE && !fs.existsSync(env.CHEONSU_UPLOAD_KEYSTORE)) issues.push('업로드 서명 키 파일이 없습니다.');
  if (env.CHEONSU_UPLOAD_KEYSTORE && /debug\.keystore$/i.test(env.CHEONSU_UPLOAD_KEYSTORE)) issues.push('개발용 debug 키로 Play에 출시할 수 없습니다.');
  const review = read('docs/play-release-review.json');
  for (const [key, label] of Object.entries({ privacyReviewed: '개인정보 처리방침 및 외부 삭제 경로 검수', googleSignInOnDevice: '실기기 Google 로그인/로그아웃/삭제', playSigningCertificateRegistered: 'Play 앱 서명 SHA 인증서 등록', contentRightsReviewed: '전체 이미지/음원/폰트 권리', dataSafetyReviewed: '데이터 보안 양식', storeListingReviewed: '스토어 정보/연령 등급/심사 정보', deviceQaPassed: 'Android 실기기 및 16KB/화면 QA' })) {
    if (review[key] !== true) issues.push(`미확인: ${label}`);
  }
  return issues;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = getPlayReleaseIssues(fileURLToPath(new URL('..', import.meta.url)));
  console.log(issues.length ? `출시 전 해결할 항목 ${issues.length}개:\n- ${issues.join('\n- ')}` : '로컬 출시 준비 검사 통과. 콘솔 심사 승인을 의미하지 않습니다.');
  process.exitCode = issues.length ? 1 : 0;
}
