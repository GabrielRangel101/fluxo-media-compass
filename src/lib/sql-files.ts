// Os arquivos de /sql embutidos no app (Vite ?raw), para a aba "SQL" e os botões "Ver SQL".
import q00 from "../../sql/00_schema.sql?raw";
import q01 from "../../sql/01_channel_summary.sql?raw";
import q02 from "../../sql/02_funnel.sql?raw";
import q03 from "../../sql/03_daily_series.sql?raw";
import q04 from "../../sql/04_reconciliation.sql?raw";
import q05 from "../../sql/05_event_health.sql?raw";
import q06 from "../../sql/06_ab_tests.sql?raw";
import q07 from "../../sql/07_platform_split.sql?raw";
import q08 from "../../sql/08_curve_inputs.sql?raw";

export interface SqlFile {
  file: string;
  title: string;
  /** o que, no painel, nasce desta consulta */
  feeds: string;
  source: string;
}

export const SQL_FILES: SqlFile[] = [
  { file: "00_schema.sql", title: "Esquema das tabelas", feeds: "Base de tudo: campanhas, gasto diário, usuários, eventos, testes e tagbook.", source: q00 },
  { file: "01_channel_summary.sql", title: "Resumo por canal", feeds: "KPIs da Visão geral, tabela de canais e economia por canal (CPI, CPA, CAC, ROAS, LTV).", source: q01 },
  { file: "02_funnel.sql", title: "Funil de coorte", feeds: "Aba Funil: etapas, conversões e custo por etapa.", source: q02 },
  { file: "03_daily_series.sql", title: "Série diária", feeds: "Gráfico de investimento e CPI da Visão geral.", source: q03 },
  { file: "04_reconciliation.sql", title: "Reconciliação entre fontes", feeds: "Aba Saúde da coleta: plataforma × AppsFlyer × backend.", source: q04 },
  { file: "05_event_health.sql", title: "Saúde dos eventos", feeds: "Aba Saúde da coleta e Tagbook: status de cada evento.", source: q05 },
  { file: "06_ab_tests.sql", title: "Testes A/B", feeds: "Aba Testes: taxas por variante e checagem de SRM. O teste z roda no motor.", source: q06 },
  { file: "07_platform_split.sql", title: "iOS × Android", feeds: "Aba Funil: CPI por plataforma.", source: q07 },
  { file: "08_curve_inputs.sql", title: "Insumo da curva de resposta", feeds: "Aba Canais: curva de resposta e simulador de verba. A regressão roda no motor.", source: q08 },
];
