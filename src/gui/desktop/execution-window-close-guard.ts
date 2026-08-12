export type WindowCloseEvent = Readonly<{ preventDefault: () => void }>;

export function createExecutionWindowCloseGuard() {
  let active = false;

  return Object.freeze({
    get active(): boolean {
      return active;
    },
    async run<Result>(operation: () => Promise<Result>): Promise<Result> {
      active = true;
      try {
        return await operation();
      } finally {
        active = false;
      }
    },
    preventClose(event: WindowCloseEvent): boolean {
      if (!active) return false;
      event.preventDefault();
      return true;
    },
  });
}
