import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { canRecoverReactRuntime, isStaleReactRuntime } from "@/lib/react-runtime-recovery";

const RECOVERY_KEY = "gazeta-react-runtime-recovery";
/** A class boundary can recover a stale dispatcher without calling any hooks. */
export class ReactRuntimeBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isStaleReactRuntime(error)) return;
    try {
      const value = sessionStorage.getItem(RECOVERY_KEY);
      const previous = value === null ? null : Number(value);
      const now = Date.now();
      if (!canRecoverReactRuntime(previous, now)) return;
      sessionStorage.setItem(RECOVERY_KEY, String(now));
      window.location.reload();
    } catch {
      // Restricted browser storage must not cause a second error or a reload loop.
    }
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <h1 className="font-display text-2xl">Vamos reabrir o painel</h1>
      <p className="text-sm text-muted-foreground">Não foi possível carregar esta versão do painel.</p>
      <Button onClick={() => window.location.reload()}>Recarregar painel</Button>
    </main>;
  }
}