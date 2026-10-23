const RECOVERY_WINDOW_MS = 60_000;
/** Only recover a stale React dispatcher, never hide ordinary application errors. */
export function isStaleReactRuntime(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Cannot read properties of null \(reading 'use(?:State|Memo|Effect|Ref|Context|Callback|Reducer|LayoutEffect|SyncExternalStore)'\)/.test(error.message);
}
export function canRecoverReactRuntime(previous: number | null, now: number): boolean {
  return previous === null || now - previous > RECOVERY_WINDOW_MS;
}