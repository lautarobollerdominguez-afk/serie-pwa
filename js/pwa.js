export class PWA {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.registration = null;
    this.installPrompt = null;
    this.offlineReady = false;
    this.updating = false;
    this.error = '';
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); this.installPrompt = event; this.onChange();
    });
    window.addEventListener('appinstalled', () => {this.installPrompt = null; this.onChange();});
    window.addEventListener('online', () => this.onChange());
    window.addEventListener('offline', () => this.onChange());
  }
  get installed() {return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;}
  async start() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      this.error = 'Para instalar y preparar el modo offline, abrí la app por HTTPS o localhost.';
      this.onChange(); return;
    }
    try {
      this.registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {scope: new URL('../', import.meta.url).pathname, updateViaCache: 'none'});
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {this.onChange();});
      };
      watch(this.registration.installing);
      this.registration.addEventListener('updatefound', () => watch(this.registration.installing));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.updating) location.reload();
        else {this.offlineReady = true; this.onChange();}
      });
      await navigator.serviceWorker.ready;
      this.offlineReady = true;
      this.onChange();
    } catch (error) {this.error = `No se pudo preparar el modo offline: ${error.message}`; this.onChange();}
  }
  async install() {
    if (!this.installPrompt) return false;
    const prompt = this.installPrompt;
    this.installPrompt = null;
    await prompt.prompt();
    const result = await prompt.userChoice;
    this.onChange();
    return result.outcome === 'accepted';
  }
  activateUpdate() {
    if (!this.registration?.waiting) return false;
    this.updating = true;
    this.registration.waiting.postMessage({type: 'SKIP_WAITING'});
    return true;
  }
}
