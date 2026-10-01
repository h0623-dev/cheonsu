import { Capacitor } from '@capacitor/core';
import config from '../data/accountConfig.json';
import { accountConfigured, createAccountManager } from './accountEngine.js';

async function getAdapter() {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('FirebaseAuthentication')) throw { code: 'auth/not-configured' };
    const { FirebaseAuthentication: auth } = await import('@capacitor-firebase/authentication');
    return {
      current: async () => (await auth.getCurrentUser()).user,
      signIn: async () => (await auth.signInWithGoogle({ useCredentialManager: true })).user,
      signOut: () => auth.signOut(),
      delete: () => auth.deleteUser(),
      subscribe: listener => { void auth.addListener('authStateChange', result => listener(result.user)).catch(() => {}); },
    };
  }
  const { initializeApp, getApps } = await import('firebase/app');
  const sdk = await import('firebase/auth');
  const app = getApps().find(entry => entry.name === 'cheonsu-account') || initializeApp(config.firebase, 'cheonsu-account');
  const auth = sdk.getAuth(app);
  auth.languageCode = 'ko';
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return {
    current: async () => { await auth.authStateReady(); return auth.currentUser; },
    signIn: async () => (await sdk.signInWithPopup(auth, provider)).user,
    signOut: () => sdk.signOut(auth),
    delete: async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('No account');
      await sdk.reauthenticateWithPopup(user, provider);
      await sdk.deleteUser(user);
    },
    subscribe: listener => sdk.onAuthStateChanged(auth, listener),
  };
}

export const accountManager = createAccountManager({ configured: accountConfigured(config), getAdapter });
