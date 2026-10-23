-- 04 · Reconciliação entre fontes: plataforma de mídia × MMP × backend.
-- Nenhuma fonte é "a verdade": cada razão tem um nível normal (a plataforma sempre infla instalações
-- vs. o MMP). O alerta é o DESVIO da razão atual (últimos 14 dias) em relação à razão do período-base
-- (primeiros 60 dias do dataset).
-- Parâmetros: :start (primeiro dia do dataset), :ref (data de referência).
-- Status: |desvio| >= 35% = broken; >= 15% = warn; volume atual < 40 = low_volume.
WITH w AS (
  SELECT :start AS bf, date(:start, '+59 day') AS bt, date(:ref, '-13 day') AS cf, :ref AS ct
),
facts AS (
  -- a = numerador (fonte comparada), b = denominador (MMP)
  SELECT 'installs_platform_vs_mmp' AS chk, channel, platform, date AS d, platform_installs AS a, 0 AS b FROM ad_spend_daily
  UNION ALL SELECT 'signups_platform_vs_mmp', channel, 'all', date, platform_signups, 0 FROM ad_spend_daily
  UNION ALL SELECT 'installs_platform_vs_mmp', channel, platform, install_date, 0, 1
            FROM users WHERE channel <> 'organic'
  UNION ALL SELECT 'signups_platform_vs_mmp', channel, 'all', install_date, 0, 1
            FROM users WHERE channel <> 'organic' AND signup_date IS NOT NULL
  UNION ALL SELECT 'signups_backend_vs_mmp', channel, 'all', install_date, 0, 1
            FROM users WHERE channel <> 'organic' AND signup_date IS NOT NULL
  -- o backend atribui o cadastro ao canal da UTM, mesmo que o MMP tenha atribuído a outro
  UNION ALL SELECT 'signups_backend_vs_mmp', utm_internal, 'all', install_date, 1, 0
            FROM users WHERE signup_date IS NOT NULL AND utm_internal NOT IN ('unattributed', 'organic')
),
agg AS (
  SELECT f.chk, f.channel, f.platform,
         COALESCE(SUM(CASE WHEN f.d BETWEEN w.bf AND w.bt THEN f.a END), 0) AS a_base,
         COALESCE(SUM(CASE WHEN f.d BETWEEN w.bf AND w.bt THEN f.b END), 0) AS b_base,
         COALESCE(SUM(CASE WHEN f.d BETWEEN w.cf AND w.ct THEN f.a END), 0) AS a_cur,
         COALESCE(SUM(CASE WHEN f.d BETWEEN w.cf AND w.ct THEN f.b END), 0) AS b_cur
  FROM facts f, w
  GROUP BY f.chk, f.channel, f.platform
),
ratios AS (
  SELECT *,
         CASE WHEN b_base > 0 THEN a_base * 1.0 / b_base END AS ratio_baseline,
         CASE WHEN b_cur  > 0 THEN a_cur  * 1.0 / b_cur  END AS ratio_current
  FROM agg
),
dev AS (
  SELECT *, CASE WHEN ratio_baseline > 0 AND ratio_current IS NOT NULL
                 THEN ratio_current / ratio_baseline - 1 END AS deviation
  FROM ratios
)
SELECT chk AS "check", channel, platform, a_cur AS a, b_cur AS b, ratio_baseline, ratio_current, deviation,
       CASE WHEN deviation IS NULL OR b_cur < 40 THEN 'low_volume'
            WHEN ABS(deviation) >= 0.35 THEN 'broken'
            WHEN ABS(deviation) >= 0.15 THEN 'warn'
            ELSE 'ok' END AS status
FROM dev
ORDER BY chk, channel, platform;
