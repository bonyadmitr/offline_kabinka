export class Store<T extends object> {
  private subs = new Set<(s: T) => void>();

  constructor(private state: T) {}

  get(): T {
    return this.state;
  }

  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.subs.forEach((f) => f(this.state));
  }

  subscribe(f: (s: T) => void): () => void {
    this.subs.add(f);
    return () => this.subs.delete(f);
  }
}
