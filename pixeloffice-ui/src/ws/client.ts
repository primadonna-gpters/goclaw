import type { PixelEvent } from '../types';

export type EventHandler = (event: PixelEvent) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handler: EventHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(handler: EventHandler) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${proto}//${location.host}/ws/pixel-office`;
    this.handler = handler;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      try {
        const event: PixelEvent = JSON.parse(e.data);
        this.handler(event);
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => { this.scheduleReconnect(); };
    this.ws.onerror = () => { this.ws?.close(); };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
