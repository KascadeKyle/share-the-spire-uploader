import type { LogEntry } from "../shared/types";

const DEFAULT_BUFFER_SIZE = 200;

type Listener = (entry: LogEntry) => void;

/**
 * In-memory ring buffer of log entries plus a fan-out for live subscribers.
 *
 * The renderer reads the buffer once on load (so it can paint historical
 * lines), then subscribes via IPC for new entries. The buffer is bounded so
 * a long-running session doesn't grow unbounded.
 */
export class Logger {
  private readonly bufferSize: number;
  private readonly buffer: LogEntry[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(bufferSize: number = DEFAULT_BUFFER_SIZE) {
    this.bufferSize = bufferSize;
  }

  /** Append a new entry, mirror it to the console, and notify subscribers. */
  append(message: string): void {
    const entry: LogEntry = { ts: Date.now(), message };
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize);
    }
    console.log(`[uploader] ${message}`);
    for (const listener of this.listeners) listener(entry);
  }

  /** Return a copy of the buffered entries, oldest first. */
  snapshot(): LogEntry[] {
    return [...this.buffer];
  }

  /** Subscribe to live entries; returns a function that detaches the listener. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
