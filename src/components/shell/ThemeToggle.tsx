import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTheme, useTheme } from "./theme";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Mudar para o tema ${next === "dark" ? "escuro" : "claro"}`}
      className={cn("inline-grid size-8 place-items-center rounded-md border bg-card text-muted-foreground hover:text-foreground", className)}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
