export class Alerts {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.context = null;
    this.wakeLock = null;
    this.wantWake = false;
    this.requestingWake = false;
    document.addEventListener('visibilitychange', () => {if (!document.hidden) void this.syncWake();});
  }
  get audioReady() {return this.context?.state === 'running';}
  async unlockAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    try {
      this.context ||= new Audio();
      this.context.onstatechange = () => this.onChange();
      if (this.context.state !== 'running') await this.context.resume();
      this.onChange();
      return this.audioReady;
    } catch {return false;}
  }
  beep() {
    if (!this.audioReady) return false;
    const context = this.context;
    for (const offset of [0, 0.28, 0.56]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const time = context.currentTime + offset;
      oscillator.type = 'sine';
      oscillator.frequency.value = offset === 0.56 ? 1046.5 : 880;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.22, time + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.19);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.21);
      oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
    }
    return true;
  }
  async notify(timer, entryName, settings, registration) {
    const recentlyEnded = Date.now() - Date.parse(timer.endsAt) < 15000;
    if (!document.hidden) {
      if (settings.soundEnabled && recentlyEnded) this.beep();
      if (settings.vibrationEnabled && recentlyEnded && 'vibrate' in navigator) {
        try {navigator.vibrate([180, 80, 180]);} catch {}
      }
    } else if (settings.notificationsEnabled && registration && 'Notification' in window && Notification.permission === 'granted') {
      try {
        await registration.showNotification(timer.kind === 'general' ? 'Temporizador terminado' : 'Descanso terminado', {
          body: timer.kind === 'general' ? 'El tiempo que configuraste terminó.' : `${entryName}. Tu próxima serie está lista.`, tag: `serie-${registration.scope}-${timer.id}`,
          icon: new URL('icons/icon-192.png', registration.scope).href,
          badge: new URL('icons/icon-192.png', registration.scope).href,
          data: {url: registration.scope}, silent: !settings.soundEnabled,
          ...(settings.vibrationEnabled && settings.soundEnabled ? {vibrate: [180,80,180]} : {})
        });
      } catch {}
    }
  }
  setWake(enabled) {this.wantWake = enabled; void this.syncWake();}
  async syncWake() {
    if (!this.wantWake || document.hidden) {
      const lock = this.wakeLock;
      this.wakeLock = null;
      if (lock) await lock.release().catch(() => {});
      this.onChange();
      return;
    }
    if (!('wakeLock' in navigator) || this.wakeLock || this.requestingWake) return;
    this.requestingWake = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!this.wantWake || document.hidden) {await lock.release(); return;}
      this.wakeLock = lock;
      lock.addEventListener('release', () => {if (this.wakeLock === lock) this.wakeLock = null; this.onChange();});
    } catch {}
    finally {this.requestingWake = false; this.onChange();}
  }
}
