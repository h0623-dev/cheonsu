export function accountConfigured(config) {
  return config?.enabled === true && ['apiKey', 'authDomain', 'projectId', 'appId'].every(key =>
    typeof config.firebase?.[key] === 'string' && config.firebase[key].trim().length > 0);
}

export function accountError(error) {
  const code = String(error?.code || '').toLowerCase();
  if (/cancel|popup-closed/.test(code)) return '로그인을 취소했습니다.';
  if (/network|offline/.test(code)) return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  if (/recent-login/.test(code)) return '계정 보호를 위해 로그아웃 후 같은 Google 계정으로 다시 로그인하고 삭제해 주세요.';
  if (/popup-blocked/.test(code)) return '브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.';
  if (/too-many/.test(code)) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  if (/not-configured/.test(code)) return 'Google 로그인 연결을 준비 중입니다. 계정 없이 계속 플레이할 수 있습니다.';
  return '계정 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function profile(user) {
  if (!user?.uid) return null;
  return { uid: user.uid, displayName: user.displayName || 'Google 사용자', email: user.email || '' };
}

// Authentication never reads or writes game saves, and tokens stay inside the SDK.
export function createAccountManager({ configured, getAdapter }) {
  let state = { ready: false, available: configured, busy: false, user: null, message: '' };
  let initPromise;
  let adapter;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const init = () => initPromise ||= (async () => {
    if (!configured) { emit({ ready: true }); return; }
    try {
      adapter = await getAdapter();
      emit({ user: profile(await adapter.current()), ready: true });
      adapter.subscribe?.(user => emit({ user: profile(user) }));
    } catch (error) {
      initPromise = undefined;
      emit({ ready: true, available: error?.code !== 'auth/not-configured', message: accountError(error) });
    }
  })();
  const run = async action => {
    if (state.busy) return false;
    emit({ busy: true, message: '' });
    try {
      await init();
      if (!state.available || !adapter) throw { code: 'auth/not-configured' };
      if (action === 'signIn') {
        const user = profile(await adapter.signIn());
        if (!user) throw new Error('No authenticated user');
        emit({ user, message: '로그인했습니다. 이 기기의 저장은 그대로 유지됩니다.' });
      } else if (action === 'signOut') {
        await adapter.signOut();
        emit({ user: null, message: '로그아웃했습니다. 이 기기의 저장은 유지됩니다.' });
      } else if (action === 'delete') {
        if (!state.user) throw new Error('No account');
        await adapter.delete();
        emit({ user: null, message: '천수 로그인 계정을 삭제했습니다. 기기 내부 게임 저장은 유지됩니다.' });
      } else throw new Error('Unknown account operation');
      return true;
    } catch (error) { emit({ message: accountError(error) }); return false; }
    finally { emit({ busy: false }); }
  };
  return { init, run, getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
}
