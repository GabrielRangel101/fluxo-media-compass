-- 06 · Testes A/B: taxas por variante e divisão de impressões (checagem de SRM).
-- A significância (teste z de duas proporções) é calculada no motor TypeScript (src/engine/experiments.ts),
-- porque SQL puro não tem a função de distribuição normal.
SELECT test_id, channel, test_type, name, variant, impressions, clicks, installs,
       clicks * 1.0 / impressions                                      AS ctr,
       installs * 1.0 / impressions                                    AS installs_per_impression,
       impressions * 1.0 / SUM(impressions) OVER (PARTITION BY test_id) AS impression_share
FROM experiments
ORDER BY test_id, variant;
