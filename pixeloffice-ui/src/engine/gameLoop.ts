export type UpdateFn = (dt: number) => void;
export type RenderFn = () => void;

export class GameLoop {
  private lastTime = 0;
  private running = false;
  private rafId = 0;
  private update: UpdateFn;
  private render: RenderFn;

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick(this.lastTime);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > 200) dt = 200; // cap for backgrounded tabs
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };
}
