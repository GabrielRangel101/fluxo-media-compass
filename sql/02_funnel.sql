-- 02 · Funil de coorte: impressões -> cliques -> instalações -> cadastro -> KYC -> primeiro uso do cartão.
-- Parâmetros: :from, :to, :ref, :channel (NULL = todos), :platform (NULL = todas).
-- A janela é cortada em D14 para o fundo do funil ser comparável entre canais.
WITH w AS (
  SELECT MIN(:to, date(:ref, '-14 day')) AS to_
),
top AS (
  SELECT SUM(a.spend) AS spend, SUM(a.impressions) AS impressions, SUM(a.clicks) AS clicks
  FROM ad_spend_daily a, w
  WHERE a.date BETWEEN :from AND w.to_
    AND (:channel IS NULL OR a.channel = :channel)
    AND (:platform IS NULL OR a.platform = :platform)
),
bottom AS (
  SELECT COUNT(*) AS installs,
         SUM(u.signup_date IS NOT NULL)    AS signups,
         SUM(u.kyc_date IS NOT NULL)       AS kyc,
         SUM(u.first_use_date IS NOT NULL) AS activated
  FROM users u, w
  WHERE u.channel <> 'organic'
    AND u.install_date BETWEEN :from AND w.to_
    AND (:channel IS NULL OR u.channel = :channel)
    AND (:platform IS NULL OR u.platform = :platform)
)
SELECT top.spend, top.impressions, top.clicks,
       bottom.installs, COALESCE(bottom.signups, 0) AS signups,
       COALESCE(bottom.kyc, 0) AS kyc, COALESCE(bottom.activated, 0) AS activated
FROM top, bottom;
