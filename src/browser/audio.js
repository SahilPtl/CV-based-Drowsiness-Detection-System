export class AlarmAudio {
  constructor({
    contextFactory = () =>
      new (window.AudioContext || window.webkitAudioContext)(),
    now = () => performance.now(),
    timers = globalThis,
  } = {}) {
    this.contextFactory = contextFactory;
    this.now = now;
    this.timers = timers;
    this.nodes = new Set();
    this.timer = null;
    this.context = null;
    this.silencedUntil = 0;
    this.blocked = false;
    this.volume = 0.55;
    this.generation = 0;
  }
  async unlock() {
    try {
      this.context ??= this.contextFactory();
      if (this.context.state !== "running") await this.context.resume();
      this.blocked = this.context.state !== "running";
    } catch {
      this.blocked = true;
    }
    return !this.blocked;
  }
  tone(delay, frequency) {
    const context = this.context;
    if (!context || context.state !== "running") {
      this.blocked = true;
      return;
    }
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(this.volume * 0.3, start + 0.02);
    gain.gain.setValueAtTime(this.volume * 0.3, start + 0.12);
    gain.gain.linearRampToValueAtTime(0, start + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const node = { oscillator, gain };
    this.nodes.add(node);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.nodes.delete(node);
    };
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  }
  pattern() {
    this.tone(0, 740);
    this.tone(0.28, 980);
  }
  stop() {
    this.generation++;
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    for (const node of this.nodes) {
      node.oscillator.onended = null;
      try {
        node.oscillator.stop();
      } catch {
        /* Already ended. */
      }
      node.oscillator.disconnect();
      node.gain.disconnect();
    }
    this.nodes.clear();
  }
  update(critical, config) {
    if (!critical) this.silencedUntil = 0;
    const volumeChanged = this.volume !== config.volume;
    this.volume = config.volume;
    if (
      !critical ||
      !config.sound ||
      config.volume === 0 ||
      this.now() < this.silencedUntil ||
      this.blocked
    ) {
      this.stop();
      return;
    }
    if (volumeChanged) this.stop();
    if (this.timer !== null) return;
    this.pattern();
    this.timer = this.timers.setInterval(() => this.pattern(), 1200);
  }
  silence() {
    this.silencedUntil = this.now() + 10000;
    this.stop();
  }
  async test(volume) {
    this.stop();
    const generation = this.generation;
    this.volume = volume;
    if ((await this.unlock()) && generation === this.generation) this.pattern();
  }
  dispose() {
    this.stop();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
