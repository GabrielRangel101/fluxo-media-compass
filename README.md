# Meridiano Subscriber Compass

Dashboard de **inteligência de assinaturas digitais (B2C)** da *Gazeta Meridiano*, um jornal **fictício**. Todos os dados são **100% sintéticos**, gerados no navegador por uma simulação determinística (seed fixa), sem nenhuma informação real de assinantes (LGPD).

Projeto de portfólio de **Gabriel Rangel**: dashboard web com motor de métricas próprio, motor de insights por regras, simulador "e se" e uma mesa de análise que responde perguntas de negócio sobre o painel.

**Demo:** https://meridiano-subscriber-compass.lovable.app

## O que responde
- **Aquisição:** funil de ponta a ponta (visitantes → início da compra → revisão → cartão → compra) por canal, com o maior vazamento e quantas assinaturas seriam recuperadas; CAC, LTV de 12 meses, LTV/CAC e payback por canal.
- **Receita:** ponte de MRR (novas, fim de promoção, reajuste, upgrades, cancelamentos) e mix de planos (base × receita).
- **Retenção:** churn por natureza e motivo, curva de permanência por safra (Kaplan-Meier, trata censura à direita) e risco de cancelamento por assinante.
- **Simulador:** três alavancas (churn voluntário, recuperação de falha de pagamento, aquisição) sobre a mesma projeção do dashboard, com o que bastaria sozinho para bater a meta.
- **Notas por mês** nos gráficos, **Pauta do dia** (achados priorizados) e **busca Ctrl/⌘+K**.

## Mesa de análise (Modo IA)
Clique num card e o painel gera leituras ligadas a ele, com sugestões de próxima pergunta. É um roteador de intenções sobre um motor determinístico: **a IA nunca calcula números**, só escolhe, ordena e redige. Responde perguntas como "qual o CAC por canal?", "vale a pena mídia paga?", "onde perco mais no funil?", "e se o churn cair 1 ponto?" e "baixar o preço melhora o churn?" (limite do efeito e custo, sem fingir causalidade).

## Arquitetura
- `src/engine/`: funções puras sobre o dataset (geração, métricas, funil, unit economics, what-if, notas, insights, roteadores de perguntas).
- `src/components/`: dashboard, simulador, painel de IA e barra de comandos.
- Testes (vitest) cobrindo o motor, os roteadores de perguntas e as legendas.

## Limites assumidos
CAC e taxas de visitante, revisão e cartão são premissas sintéticas por canal. Não há teste de preço nos dados, então a elasticidade não é medida.

## Rodar localmente
```bash
bun install   # ou npm install
bun dev       # ou npm run dev
bun run test  # vitest
```

## Stack
TanStack Start + React + Vite, Tailwind + shadcn/ui, Recharts, framer-motion.
