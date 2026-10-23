-- 03 · Série diária de gasto, cliques, instalações, cadastros e CPI.
-- Parâmetros: :from, :to, :channel (NULL = todos os canais pagos).
WITH d AS (
  SELECT date, SUM(spend) AS spend, SUM(clicks) AS clicks
  FROM ad_spend_daily
  WHERE date BETWEEN :from AND :to AND (:channel IS NULL OR channel = :channel)
  GROUP BY date
),
u AS (
  SELECT install_date AS date, COUNT(*) AS installs, SUM(signup_date IS NOT NULL) AS signups
  FROM users
  WHERE channel <> 'organic' AND install_date BETWEEN :from AND :to AND (:channel IS NULL OR channel = :channel)
  GROUP BY install_date
)
SELECT d.date, d.spend, d.clicks,
       COALESCE(u.installs, 0) AS installs, COALESCE(u.signups, 0) AS signups,
       CASE WHEN COALESCE(u.installs, 0) > 0 THEN d.spend / u.installs END AS cpi
FROM d LEFT JOIN u ON u.date = d.date
ORDER BY d.date;
