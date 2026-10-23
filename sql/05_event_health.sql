-- 05 · Saúde dos eventos do tagbook: contagem do SDK/GA4 ÷ referência independente.
-- Referências: app = backend (usuários por data do evento); page_view = cliques pagos das plataformas;
-- cta_click = page_view; form_submit = cta_click.
-- Razão-base = primeiros 60 dias; razão atual = últimos 7 dias.
-- Parâmetros: :start, :ref.
WITH w AS (
  SELECT :start AS bf, date(:start, '+59 day') AS bt, date(:ref, '-6 day') AS cf, :ref AS ct
),
ev AS (
  SELECT event_name AS e, platform AS p, date AS d, event_count AS v FROM events_daily
),
ref AS (
  SELECT 'first_open' AS e, platform AS p, install_date AS d, COUNT(*) AS v FROM users GROUP BY 2, 3
  UNION ALL SELECT 'signup_completed', platform, signup_date, COUNT(*) FROM users WHERE signup_date IS NOT NULL GROUP BY 2, 3
  UNION ALL SELECT 'kyc_done', platform, kyc_date, COUNT(*) FROM users WHERE kyc_date IS NOT NULL GROUP BY 2, 3
  UNION ALL SELECT 'card_first_use', platform, first_use_date, COUNT(*) FROM users WHERE first_use_date IS NOT NULL GROUP BY 2, 3
  UNION ALL SELECT 'page_view', 'web', date, SUM(clicks) FROM ad_spend_daily GROUP BY 3
  UNION ALL SELECT 'cta_click', 'web', date, event_count FROM events_daily WHERE event_name = 'page_view'
  UNION ALL SELECT 'form_submit', 'web', date, event_count FROM events_daily WHERE event_name = 'cta_click'
),
j AS (
  SELECT ev.e, ev.p, ev.d, ev.v AS ev_v, COALESCE(ref.v, 0) AS ref_v
  FROM ev LEFT JOIN ref ON ref.e = ev.e AND ref.p = ev.p AND ref.d = ev.d
),
agg AS (
  SELECT j.e, j.p,
         SUM(CASE WHEN j.d BETWEEN w.bf AND w.bt THEN j.ev_v  END) AS ev_base,
         SUM(CASE WHEN j.d BETWEEN w.bf AND w.bt THEN j.ref_v END) AS ref_base,
         SUM(CASE WHEN j.d BETWEEN w.cf AND w.ct THEN j.ev_v  END) AS ev_cur,
         SUM(CASE WHEN j.d BETWEEN w.cf AND w.ct THEN j.ref_v END) AS ref_cur
  FROM j, w GROUP BY j.e, j.p
),
ratios AS (
  SELECT *,
         CASE WHEN ref_base > 0 THEN ev_base * 1.0 / ref_base END AS ratio_baseline,
         CASE WHEN ref_cur  > 0 THEN ev_cur  * 1.0 / ref_cur  END AS ratio_current
  FROM agg
),
dev AS (
  SELECT *, CASE WHEN ratio_baseline > 0 AND ratio_current IS NOT NULL
                 THEN ratio_current / ratio_baseline - 1 END AS deviation
  FROM ratios
)
SELECT e AS event, p AS platform, ratio_baseline, ratio_current, deviation,
       CASE WHEN deviation IS NULL OR ref_cur < 40 THEN 'low_volume'
            WHEN ABS(deviation) >= 0.35 THEN 'broken'
            WHEN ABS(deviation) >= 0.15 THEN 'warn'
            ELSE 'ok' END AS status
FROM dev
ORDER BY e, p;
