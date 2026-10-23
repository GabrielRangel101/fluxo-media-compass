-- 07 · Gasto, instalações e CPI por canal × plataforma (iOS custa mais que Android?).
-- Parâmetros: :from, :to.
WITH s AS (
  SELECT channel, platform, SUM(spend) AS spend FROM ad_spend_daily
  WHERE date BETWEEN :from AND :to GROUP BY channel, platform
),
i AS (
  SELECT channel, platform, COUNT(*) AS installs FROM users
  WHERE channel <> 'organic' AND install_date BETWEEN :from AND :to GROUP BY channel, platform
)
SELECT s.channel, s.platform, s.spend, COALESCE(i.installs, 0) AS installs,
       CASE WHEN COALESCE(i.installs, 0) > 0 THEN s.spend / i.installs END AS cpi
FROM s LEFT JOIN i ON i.channel = s.channel AND i.platform = s.platform
ORDER BY s.channel, s.platform;
