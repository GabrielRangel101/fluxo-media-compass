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

- Fluxo Media Compass: fintech fictícia, dados 100% sintéticos (seed fixa). src/engine/* é o motor puro e testado (node --test "tests/*.test.ts"); não editar sem rodar os testes de motor e de equivalência com /sql.
- A UI lê dados só via src/lib/dashboard-data.ts (singleton sobre o motor). Componentes em src/components/dashboard são de apresentação, sem cálculo de negócio.
- Views escolhidas por ?view= (geral, canais, funil, testes, tracking, tagbook, sql; &file= na aba sql). Tokens de design em src/styles.css; tema claro padrão, escuro via :root[data-theme="dark"].
- Os arquivos de /sql são embutidos com ?raw (src/lib/sql-files.ts).
