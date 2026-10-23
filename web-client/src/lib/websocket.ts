"use client";

import { Api } from "./endpoints";
import { api } from "./api";

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type ServerEvent = {
  type: string;
  at: number;
  payload: Record<string, unknown>;
};

type Listener = (event: ServerEvent) => void;
type StateListener = (state: ConnectionState) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private wanted = false;
  private state: ConnectionState = "disconnected";
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  onEvent(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  connect() {
    this.wanted = true;
    this.attempt = 0;
    this.open();
  }

  disconnect() {
    this.wanted = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
  }

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    for (const fn of this.stateListeners) {
      try {
        fn(next);
      } catch {
        // ignore
      }
    }
  }

  private open() {
    if (!this.wanted) return;
    const base = api.server;
    const token = api.token;
    if (!base || !token) {
      this.setState("disconnected");
      return;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.setState("connecting");

    let url: string;
    try {
      const fallback = typeof window !== "undefined" ? window.location.origin : "http://localhost:9683";
      const parsed = new URL(base || fallback);
      const scheme = parsed.protocol === "https:" ? "wss:" : "ws:";
      let host = parsed.host;
      if (host.includes(":3000") || host.includes(":5437")) {
        host = `${parsed.hostname}:9683`;
      }
      url = `${scheme}//${host}${Api.ws}?access_token=${encodeURIComponent(token)}`;
    } catch {
      this.scheduleReconnect();
      return;
    }

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (!this.wanted) {
          ws.close();
          return;
        }
        this.attempt = 0;
        this.setState("connected");
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data && typeof data === "object") {
            const ev: ServerEvent = {
              type: data.type || "",
              at: data.at || Date.now(),
              payload: data.payload || {},
            };
            for (const fn of this.listeners) {
              try {
                fn(ev);
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.wanted) {
          this.setState("disconnected");
          this.scheduleReconnect();
        } else {
          this.setState("disconnected");
        }
      };

      ws.onerror = () => {
        // onclose follows
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.wanted || this.timer) return;
    this.setState("disconnected");
    const delay = Math.min(1000 * Math.pow(1.5, this.attempt++), 10000);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }
}

export const wsClient = new WebSocketClient();
