-- 01 · Resumo por canal (CPI, CPA, CAC, ROAS D30/D90, LTV90) + total de mídia paga.
-- Parâmetros: :from, :to (janela por data de instalação e de gasto), :ref (data de referência),
--             :platform (NULL = todas).
--
-- Regras de maturidade (evitam comparar coortes que ainda não "fecharam"):
--   ativação e CAC  -> só instalações com >= 14 dias de vida;
--   ROAS D30        -> só >= 30 dias (rev_d30 NOT NULL);  ROAS D90 e LTV90 -> só >= 90 dias (rev_d90 NOT NULL).
-- Nota: LTV90 ÷ CAC da mesma coorte = ROAS D90.
WITH p AS (
  SELECT date(:ref, '-14 day') AS d14, date(:ref, '-30 day') AS d30, date(:ref, '-90 day') AS d90
),
spend AS (
  SELECT a.channel,
         SUM(a.spend)             AS spend,
         SUM(a.impressions)       AS impressions,
         SUM(a.clicks)            AS clicks,
         SUM(a.platform_installs) AS platform_installs,
         SUM(a.platform_signups)  AS platform_signups,
         SUM(CASE WHEN a.date <= p.d14 THEN a.spend ELSE 0 END) AS spend_m,
         SUM(CASE WHEN a.date <= p.d30 THEN a.spend ELSE 0 END) AS spend_30,
         SUM(CASE WHEN a.date <= p.d90 THEN a.spend ELSE 0 END) AS spend_90
  FROM ad_spend_daily a, p
  WHERE a.date BETWEEN :from AND :to
    AND (:platform IS NULL OR a.platform = :platform)
  GROUP BY a.channel
),
cohort AS (
  SELECT u.channel,
         COUNT(*)                                                                AS installs,
         SUM(u.signup_date IS NOT NULL)                                          AS signups,
         SUM(u.install_date <= p.d14)                                            AS installs_m,
         SUM(u.install_date <= p.d14 AND u.signup_date IS NOT NULL)              AS signups_m,
         SUM(u.install_date <= p.d14 AND u.kyc_date IS NOT NULL)                 AS kyc_m,
         SUM(u.install_date <= p.d14 AND u.first_use_date IS NOT NULL)           AS activated_m,
         COALESCE(SUM(u.rev_d30), 0)                                             AS rev_30,
         COALESCE(SUM(u.rev_d90), 0)                                             AS rev_90,
         SUM(u.rev_d90 IS NOT NULL AND u.first_use_date IS NOT NULL)             AS activated_90
  FROM users u, p
  WHERE u.channel <> 'organic'
    AND u.install_date BETWEEN :from AND :to
    AND (:platform IS NULL OR u.platform = :platform)
  GROUP BY u.channel
),
by_channel AS (
  SELECT s.channel, s.spend, s.impressions, s.clicks, s.platform_installs, s.platform_signups,
         COALESCE(c.installs, 0) AS installs, COALESCE(c.signups, 0) AS signups,
         COALESCE(c.installs_m, 0) AS installs_m, COALESCE(c.signups_m, 0) AS signups_m,
         COALESCE(c.kyc_m, 0) AS kyc_m, COALESCE(c.activated_m, 0) AS activated_m,
         s.spend_m, s.spend_30, COALESCE(c.rev_30, 0) AS rev_30,
         s.spend_90, COALESCE(c.rev_90, 0) AS rev_90, COALESCE(c.activated_90, 0) AS activated_90
  FROM spend s LEFT JOIN cohort c ON c.channel = s.channel
),
with_total AS (
  SELECT * FROM by_channel
  UNION ALL
  SELECT 'paid_total', SUM(spend), SUM(impressions), SUM(clicks), SUM(platform_installs), SUM(platform_signups),
         SUM(installs), SUM(signups), SUM(installs_m), SUM(signups_m), SUM(kyc_m), SUM(activated_m),
         SUM(spend_m), SUM(spend_30), SUM(rev_30), SUM(spend_90), SUM(rev_90), SUM(activated_90)
  FROM by_channel
)
SELECT channel, spend, impressions, clicks, platform_installs, platform_signups, installs, signups,
       installs_m, signups_m, kyc_m, activated_m, spend_m, spend_30, rev_30, spend_90, rev_90, activated_90,
       CASE WHEN impressions  > 0 THEN spend * 1000.0 / impressions END AS cpm,
       CASE WHEN impressions  > 0 THEN clicks * 1.0 / impressions END   AS ctr,
       CASE WHEN clicks       > 0 THEN spend / clicks END               AS cpc,
       CASE WHEN installs     > 0 THEN spend / installs END             AS cpi,
       CASE WHEN clicks       > 0 THEN installs * 1.0 / clicks END      AS installs_per_click,
       CASE WHEN signups      > 0 THEN spend / signups END              AS cpa_signup,
       CASE WHEN installs_m   > 0 THEN signups_m * 1.0 / installs_m END AS signup_rate,
       CASE WHEN signups_m    > 0 THEN kyc_m * 1.0 / signups_m END      AS kyc_rate,
       CASE WHEN installs_m   > 0 THEN activated_m * 1.0 / installs_m END AS activation_rate,
       CASE WHEN activated_m  > 0 THEN spend_m / activated_m END        AS cac,
       CASE WHEN spend_30     > 0 THEN rev_30 / spend_30 END            AS roas_30,
       CASE WHEN spend_90     > 0 THEN rev_90 / spend_90 END            AS roas_90,
       CASE WHEN activated_90 > 0 THEN rev_90 / activated_90 END        AS ltv_90
FROM with_total;
