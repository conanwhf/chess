import { useEffect, useRef, useState } from 'react';
import { AUDIO_KEY, GameAudio, type AudioSettings, type Sound } from './audio';

export function useAudio(active: boolean, onError: (message: string) => void) {
  const [settings, setSettings] = useState<AudioSettings>({ effects: true, music: true });
  const audio = useRef<GameAudio | null>(null);
  const interacted = useRef(false);
  const current = useRef({ active, settings });
  current.current = { active, settings };
  const report = useRef(onError);
  report.current = onError;
  const fail = (error: unknown) => report.current(`声音未能播放或保存 / Audio unavailable: ${error instanceof Error ? error.message : String(error)}`);

  useEffect(() => {
    const player = new GameAudio(fail);
    audio.current = player;
    try {
      const raw = localStorage.getItem(AUDIO_KEY);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (!saved || typeof saved !== 'object' || !('effects' in saved) || typeof saved.effects !== 'boolean' || !('music' in saved) || typeof saved.music !== 'boolean') throw new Error('声音设置无效 / Invalid sound settings');
        setSettings({ effects: saved.effects, music: saved.music });
      }
    } catch (error) { fail(error); }
    const unlock = () => {
      interacted.current = true;
      player.configure(current.current.settings, current.current.active && !document.hidden);
      player.unlock();
    };
    const hide = () => { if (document.hidden) player.configure(current.current.settings, false); };
    document.addEventListener('pointerup', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('pointerup', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', hide);
      player.dispose(); audio.current = null;
    };
  }, []);

  useEffect(() => {
    audio.current?.configure(settings, active && !document.hidden);
    if (interacted.current && active && !document.hidden) audio.current?.unlock();
  }, [settings, active]);

  const change = (next: AudioSettings) => {
    setSettings(next);
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify(next)); }
    catch (error) { fail(error); }
  };
  const play = (sound: Sound) => audio.current?.play(sound);
  const silence = () => audio.current?.configure(current.current.settings, false);
  return { settings, change, play, silence };
}
