import { Sample, makeInputVector } from "./types";

export class RingBufferDataset {
  private capacity: number;
  private samples: Sample[];
  private idx: number;
  private filled: boolean;

  constructor(capacity = 10000) {
    this.capacity = capacity;
    this.samples = new Array(capacity);
    this.idx = 0;
    this.filled = false;
  }

  clear() {
    this.samples = new Array(this.capacity);
    this.idx = 0;
    this.filled = false;
  }

  size(): number {
    return this.filled ? this.capacity : this.idx;
  }

  add(sample: Sample) {
    this.samples[this.idx] = sample;
    this.idx = (this.idx + 1) % this.capacity;
    if (this.idx === 0) this.filled = true;
  }

  toArray(): Sample[] {
    if (!this.filled) return this.samples.slice(0, this.idx);
    // return in insertion order
    return [
      ...this.samples.slice(this.idx),
      ...this.samples.slice(0, this.idx)
    ];
  }

  exportJSON(): string {
    return JSON.stringify({ capacity: this.capacity, data: this.toArray() });
  }

  importJSON(json: string) {
    const parsed = JSON.parse(json);
    const data: Sample[] = parsed.data ?? [];
    this.clear();
    for (const s of data) this.add(s);
  }
}
