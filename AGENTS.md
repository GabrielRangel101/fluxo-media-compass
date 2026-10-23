<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- src/engine/* is a verbatim, tested data engine including the user-provided ask.ts; never edit existing engine files. tsconfig has noUncheckedIndexedAccess=false and exactOptionalPropertyTypes=false so the literal engine compiles unchanged while strict remains enabled.
- UI reads data only via src/lib/dashboard-data.ts (module singleton over the engine); dashboard components in src/components/dashboard are presentational — no business math there.
- Design tokens live in src/styles.css as full hsl() values (user request), mapped in @theme inline; :root holds the default dark theme and :root[data-theme=light] the optional light one; categorical chart colors are --cat-1..6 and chart grids use --chart-grid.
- App shell lives in src/components/shell (rail, top bar, bottom tabs, theme store); views live in src/components/views and are selected by the ?view= search param on / so each view is linkable. Theme choice is applied by an inline head script plus a useSyncExternalStore store, so SSR stays deterministic.
- Dashboard cards use DashCard (one-line header, body fills remaining height); at ≥1280px views are fixed-height grids with no page scroll, so new cards must size to their grid cell and scroll internally.
- Correlation modes, risk summaries, people samples, deltas and insight view-models are computed in the shared dashboard singleton; engine entry points may internally recompute risk and must remain untouched.
- Insight navigation maps topic → view (INSIGHT_VIEWS) and → stable card ID (INSIGHT_TARGETS), switching view before highlighting; chart geometry and local avatar hashing are presentation-only calculations.
- Motion preferences that affect SSR markup use a hydration-safe reduced-motion fallback to prevent first-render mismatches and hidden content.
- Prebundle React, its renderer/JSX runtimes and all directly imported dashboard/AI UI dependencies (including Radix Dialog) together in Vite to avoid late cache-generation changes mixing dispatchers. The hook-free shell boundary recovers stale React dispatcher errors with one reload per minute and never loops.
- AI UI lives in src/components/ai; scheduled, cached answers use the shared dashboard singleton, keeping all business numbers inside answer() and the existing dashboard untouched.
- Window-based cards (reasons, funnel, volume × quality, base bridge) read one fixed trailing window from getWindowData() in dashboard-data; there is no global period state, so every card shows the same reference month.
