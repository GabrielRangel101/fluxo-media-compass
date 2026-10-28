# Fluxo · Media & Tracking Compass

Dashboard de **mídia paga, aquisição de app e saúde da coleta** para a *Fluxo*, uma fintech **fictícia** (conta digital + cartão). Todos os dados são **100% sintéticos**, gerados por uma simulação determinística (seed fixa), sem nenhuma informação real.

Projeto de portfólio de **Gabriel Rangel** · [LinkedIn](https://www.linkedin.com/in/gabriel-rangel-a954ba26a/) · [GitHub](https://github.com/GabrielRangel101) · [App ao vivo](https://fluxo-media-compass.lovable.app) · [Demo automática](https://fluxo-media-compass.lovable.app/?demo=1). Mesma filosofia do dashboard da Gazeta Meridiano: motor de métricas próprio e testado, e uma "mesa de análise" em que **a IA nunca calcula números**, só escolhe a análise e redige.

## O que ele responde

| Módulo | Pergunta que responde |
|---|---|
| Visão executiva | Quanto investimos, a que CPI/CPA/CAC, e o que mudou nos últimos 28 dias? |
| Canais e alocação | Qual canal paga o próprio custo em 90 dias? Se eu mover 20% da verba de A para B, o que muda? |
| Funil do app | Onde se perde gente entre clique, instalação, cadastro, KYC e primeiro uso do cartão, por canal? |
| Testes A/B | Este teste pode ser lido? (SRM, amostra mínima, significância) |
| Saúde da coleta | As fontes (plataforma × AppsFlyer × backend) ainda concordam? O que quebrou e quando? |
| Tagbook | Quais eventos existem, quem é o dono, para onde vão e se estão saudáveis? |
| SQL | Qual consulta gera cada número? |

## Como rodar o motor (só Node ≥ 22.18, zero dependências)

```bash
node --test "tests/*.test.ts"   # 33 testes: motor + equivalência SQL × TypeScript
node scripts/build-db.ts        # gera data/fluxo.sqlite e CSVs (DBeaver, Power BI, Looker Studio)
sqlite3 data/fluxo.sqlite < sql/01_channel_summary.sql   # exige passar os parâmetros (:from, :to, :ref, :platform)
```

## Como rodar a interface (React + TanStack Start)

```bash
bun install
bun dev          # abre em http://localhost:3000 (a rota é gerada em src/routeTree.gen.ts na primeira execução)
```

Abas (`/?view=`): `geral`, `canais` (curva de resposta + simulador de verba), `funil`, `testes`, `tracking`, `tagbook`, `sql` (`&file=04_reconciliation.sql`). A UI lê dados só via `src/lib/dashboard-data.ts`.

> **Estado de verificação.** Motor, pacote SQL e testes (`node --test "tests/*.test.ts"`, 33 testes) passam. A interface está publicada em https://fluxo-media-compass.lovable.app e foi aberta no navegador; os testes automatizados cobrem o motor e o SQL, não os componentes de tela.

## Pacote SQL (`/sql`)

Cada arquivo é uma consulta comentada. O teste `tests/sql-equivalence.test.ts` roda cada uma sobre o mesmo dataset e exige que o resultado **bata com o motor TypeScript** (tolerância 1e-9). Se alguém alterar uma regra só de um lado, o teste quebra.

| Arquivo | Conteúdo |
|---|---|
| `00_schema.sql` | Tabelas: campanhas, gasto diário por plataforma, usuários (MMP + backend), eventos, testes, tagbook |
| `01_channel_summary.sql` | CPM, CTR, CPC, CPI, CPA, CAC, ROAS D30/D90, LTV90 por canal |
| `02_funnel.sql` | Funil de coorte, com custo por etapa |
| `03_daily_series.sql` | Série diária de gasto, instalações e CPI |
| `04_reconciliation.sql` | Plataforma × MMP × backend, com desvio contra o período-base |
| `05_event_health.sql` | Eventos do tagbook contra uma referência independente |
| `06_ab_tests.sql` | Taxas por variante e divisão de impressões (SRM) |
| `07_platform_split.sql` | iOS × Android |
| `08_curve_inputs.sql` | Insumo da curva de resposta por canal |

A significância dos testes A/B (teste z) e a regressão da curva de resposta rodam no TypeScript, porque SQL puro não tem essas funções.

## Definições de métricas

- **CPI** = gasto ÷ instalações atribuídas pelo MMP. **CPA** = gasto ÷ cadastros concluídos.
- **CAC** = gasto ÷ usuários que usaram o cartão em até 14 dias. **Ativação** = primeiro uso do cartão.
- **ROAS D30 / D90** = receita acumulada em 30 / 90 dias ÷ gasto da mesma coorte. **LTV90** = receita D90 ÷ usuários ativados. LTV90 ÷ CAC da mesma coorte é o ROAS D90.
- **Maturidade**: o fundo do funil (ativação, CAC) só usa coortes com 14+ dias; ROAS D30 exige 30+ dias; ROAS D90 e LTV90 exigem 90+. Coorte recente não tem ROAS, e o painel mostra isso em vez de um número enganoso.
- **CPI marginal** = CPI ÷ β, com β estimado por regressão log-log de instalações sobre gasto (período até D-45, antes das falhas de coleta).

## Defeitos de coleta injetados (de propósito)

O dataset tem cinco falhas de tracking plantadas. O painel de saúde da coleta as encontra sem ser avisado, com a data de início recuperada dos dados, e os testes conferem que **só elas** são sinalizadas.

| Falha | Como aparece | Início |
|---|---|---|
| `kyc_done` some no SDK Android | Razão SDK ÷ backend cai 96% só no Android | 08/09 |
| `form_submit` duplicado no GTM | Razão `form_submit` ÷ `cta_click` dobra | 12/08 |
| Google Ads importa cadastro duas vezes | Plataforma ÷ MMP vai de 1,05 para 2,00 | 01/08 |
| Meta iOS perde atribuição no MMP | Plataforma ÷ MMP de instalações vai de 1,18 para 1,87; o CPI do Meta parece subir | 24/08 |
| LinkedIn sem `utm_source` em uma campanha | Razão UTM do backend ÷ MMP cai 49% | 20/07 |

Uma razão entre fontes nunca é comparada a 1: a plataforma **sempre** infla instalações frente ao MMP (view-through, modelagem). O alerta é o desvio contra o nível normal de cada par.

## Limites

- Dados sintéticos: os números provam o método, não retratam nenhum mercado.
- A curva de resposta só extrapola dentro de 60%–160% do gasto atual e assume eficiência constante. O simulador serve para formular hipótese de teste, não para decidir verba sozinho.
- LinkedIn tem poucas instalações por dia: a elasticidade dele é estimada em blocos semanais e marcada como baixa confiança.

## Mesa de análise (Modo IA)

Botão **Mesa de análise** no topo ou o ✦ em qualquer KPI/gráfico: o dashboard escurece, o card escolhido fica em foco e os cards gerados (barras, linhas, tabelas, indicadores) se conectam a ele por linhas, arrastáveis. Dá para perguntar qualquer coisa sobre os dados do painel: por que o CPI subiu (decomposição CPM × CTR × conversão), períodos ("últimos 14 dias", "março"), simulação de verba, curva de resposta, coleta/tagbook, testes A/B, funil, iOS × Android, e como cada métrica é calculada. Pergunta fora do escopo recebe uma resposta de escopo, nunca um palpite. Todo número vem do motor (`src/engine/aiask.ts` só roteia e redige; testes em `tests/ai-ask.test.ts`).

## Modo demo

Abra `/?demo=1` numa tela com 1024 px ou mais: um roteiro de ~45 s percorre o painel sozinho, com cursor e legendas, para gravar o vídeo de apresentação (Mesa de análise, defeitos na linha do tempo, CPI corrigido, orgânico por semana, confiança do ROAS, marca × sem marca, simulador e plano de teste). Esc interrompe.
