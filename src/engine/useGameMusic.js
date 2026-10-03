import { useEffect, useRef } from 'react';
import { createMusicPlayer, getAudioContext } from './audioEngine.js';
import { getMusicTheme } from '../data/musicScore.js';
import { stopSoundEffects } from './soundEffects.js';

export function useGameMusic({ screen, stageId, result, settings }) {
  const current = useRef({ theme: { id: 'title', variant: 0 }, player: null });
  const { id, variant } = getMusicTheme(screen, stageId) || {};
  useEffect(() => {
    const state = current.current;
    if (id) state.theme = { id, variant };
    const enabled = settings.soundOn && settings.musicOn && settings.sfxVolume > 0 && !result;
    let disposed = false;
    const sync = async (gesture = false) => {
      if (!settings.soundOn || settings.sfxVolume <= 0 || document.hidden) stopSoundEffects();
      if (!enabled || document.hidden) { state.player?.stop(); return; }
      const ctx = getAudioContext();
      if (!ctx) return;
      if (gesture && ctx.state === 'suspended') await ctx.resume().catch(() => {});
      if (disposed || document.hidden || ctx.state !== 'running') return;
      state.player ||= createMusicPlayer(ctx);
      void state.player.start(state.theme, settings.sfxVolume / 100);
    };
    const unlock = () => { void sync(true); };
    const visibility = () => { void sync(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    void sync();
    return () => {
      disposed = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [id, variant, result, settings.soundOn, settings.musicOn, settings.sfxVolume]);
  useEffect(() => {
    const state = current.current;
    return () => { state.player?.stop(); };
  }, []);
}
