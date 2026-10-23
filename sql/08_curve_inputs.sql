-- 08 · Insumo da curva de resposta (instalações = A × gasto^β): gasto e instalações diários por canal,
-- só até D-45 (antes de qualquer falha de coleta conhecida). A regressão log-log roda no motor
-- (src/engine/allocation.ts); em SQL, o mesmo ajuste seria feito sobre esta consulta no seu BI ou em Python.
-- Parâmetros: :ref.
WITH s AS (
  SELECT channel, date, SUM(spend) AS spend FROM ad_spend_daily
  WHERE date <= date(:ref, '-45 day') GROUP BY channel, date
),
i AS (
  SELECT channel, install_date AS date, COUNT(*) AS installs FROM users
  WHERE channel <> 'organic' AND install_date <= date(:ref, '-45 day') GROUP BY channel, install_date
)
SELECT s.channel, s.date, s.spend, COALESCE(i.installs, 0) AS installs
FROM s LEFT JOIN i ON i.channel = s.channel AND i.date = s.date
ORDER BY s.channel, s.date;
