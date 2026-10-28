import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { aiStore } from "@/components/ai/ai-store";
import type { ViewId } from "@/lib/dashboard-data";

/**
 * Modo demo: abra com ?demo=1 (ou #demo). Portado do dashboard da Gazeta Meridiano. Roda um roteiro sozinho sobre a interface real, com cursor animado e legendas,
 * para gravar o vídeo de apresentação. Esc interrompe. Nada aqui calcula dados: só clica, digita e espera.
 */

class Stopped extends Error {}

interface Caption {
  title: string;
  sub?: string;
}

const CURSOR = (
  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
    <path d="M4 2.5 19.5 12 12.6 13.4 16.4 21 13.3 22.4 9.6 14.8 4.6 19.4Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export function DemoTour() {
  const navigate = useNavigate();
  const [on, setOn] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [clickKey, setClickKey] = useState(0);
  const cursorRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const stopped = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // o roteiro usa o layout de desktop (≥ 1280 px)
    if ((p.has("demo") || window.location.hash === "#demo") && window.innerWidth >= 1280) setOn(true);
  }, []);

  useEffect(() => {
    if (!on) return;
    stopped.current = false;
    document.documentElement.classList.add("demo-running");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopped.current = true;
    };
    window.addEventListener("keydown", onKey);

    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t0 = performance.now();
        const tick = () => {
          if (stopped.current) return reject(new Stopped());
          if (performance.now() - t0 >= ms) return resolve();
          requestAnimationFrame(tick);
        };
        tick();
      });

    const find = async (pick: () => Element | null | undefined, timeout = 5000): Promise<HTMLElement> => {
      const t0 = performance.now();
      for (;;) {
        const el = pick();
        if (el instanceof HTMLElement) return el;
        if (performance.now() - t0 > timeout) throw new Error("demo: elemento não encontrado");
        await sleep(80);
      }
    };
    const $ = (sel: string) => () => document.querySelector(sel);
    const byText = (sel: string, text: string) => () => [...document.querySelectorAll(sel)].find((b) => b.textContent?.includes(text));

    const place = (x: number, y: number) => {
      pos.current = { x, y };
      if (cursorRef.current) cursorRef.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const moveTo = async (x: number, y: number, ms = 500) => {
      const { x: x0, y: y0 } = pos.current;
      const t0 = performance.now();
      for (;;) {
        const t = Math.min(1, (performance.now() - t0) / ms);
        place(x0 + (x - x0) * ease(t), y0 + (y - y0) * ease(t));
        if (t >= 1) return;
        await sleep(16);
      }
    };
    const center = (el: HTMLElement, fx = 0.5, fy = 0.5) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * fx, y: r.top + r.height * fy };
    };
    const moveToEl = async (el: HTMLElement, ms?: number, fx?: number, fy?: number) => {
      const c = center(el, fx, fy);
      await moveTo(c.x, c.y, ms);
    };
    const click = async (el: HTMLElement, ms?: number) => {
      await moveToEl(el, ms);
      await sleep(90);
      setClickKey((k) => k + 1);
      el.click();
      await sleep(150);
    };
    /** passa o "mouse" sobre um gráfico para acender o tooltip */
    const scrub = async (el: HTMLElement, from: number, to: number, fy = 0.55, ms = 1800) => {
      const r = el.getBoundingClientRect();
      const t0 = performance.now();
      let last: Element | null = null;
      for (;;) {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const x = r.left + r.width * (from + (to - from) * ease(t));
        const y = r.top + r.height * fy;
        place(x, y);
        const target = document.elementFromPoint(x, y);
        if (target) {
          target.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
          last = target;
        }
        if (t >= 1) break;
        await sleep(16);
      }
      await sleep(500);
      last?.dispatchEvent(new MouseEvent("mouseout", { clientX: 0, clientY: 0, bubbles: true, relatedTarget: document.body }));
      last?.dispatchEvent(new MouseEvent("mouseleave", { clientX: 0, clientY: 0, bubbles: false }));
    };
    const setNative = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const type = async (input: HTMLInputElement, text: string, perChar = 45) => {
      input.focus();
      for (let i = 1; i <= text.length; i++) {
        setNative(input, text.slice(0, i));
        await sleep(perChar + (text[i - 1] === " " ? 30 : 0));
      }
    };
    const waitAi = async (extra: number) => {
      await sleep(150);
      const t0 = performance.now();
      while (aiStore.get().busy && performance.now() - t0 < 6000) await sleep(80);
      await sleep(extra);
    };
    const go = async (view: ViewId) => {
      const link = document.querySelector<HTMLElement>(`header a[href*="view=${view}"]`);
      if (link) {
        await moveToEl(link, 450);
        await sleep(80);
        setClickKey((k) => k + 1);
      }
      void navigate({ to: "/", search: { view } });
      window.scrollTo({ top: 0 });
      await sleep(650);
    };
    /** rola até o card (a página do Fluxo rola; a da Gazeta cabia na tela) */
    const show = async (el: HTMLElement, block: ScrollLogicalPosition = "center") => {
      el.scrollIntoView({ block, behavior: "smooth" });
      await sleep(750);
    };
    const card = (id: string) => find($(`[data-ai-target="${id}"]`));
    const chartIn = async (id: string, index = 0) => find(() => document.querySelectorAll(`[data-ai-target="${id}"] .recharts-wrapper`)[index]);
    const slide = async (input: HTMLInputElement, from: number, to: number, step: number) => {
      await moveToEl(input, 450, (from - Number(input.min)) / (Number(input.max) - Number(input.min)), 0.5);
      for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
        setNative(input, String(v));
        await moveToEl(input, 140, (v - Number(input.min)) / (Number(input.max) - Number(input.min)), 0.5);
        await sleep(260);
      }
    };
    const hideOld = () => {
      for (const ex of aiStore.get().exchanges) {
        aiStore.hide(`${ex.id}:read`);
        for (const c of ex.answer?.cards ?? []) aiStore.hide(`${ex.id}:${c.id}`);
      }
    };
    const mesa = () => find(byText("header button", "Mesa de análise"));
    const say = (title: string, sub?: string) => setCaption({ title, sub });

    const run = async () => {
      aiStore.close();
      aiStore.clear();
      void navigate({ to: "/", search: { view: "geral" } });
      window.scrollTo({ top: 0 });
      place(window.innerWidth * 0.5, window.innerHeight * 0.7);
      await sleep(1800);

      // 1 · abertura
      say("Fluxo Media Compass", "Mídia paga, aquisição de app e saúde da coleta · dados sintéticos, motor de métricas próprio");
      for (const k of ["kpi-spend", "kpi-installs", "kpi-cpi", "kpi-cac", "kpi-roas"]) {
        await moveToEl(await card(k), 360);
        await sleep(120);
      }

      // 2 · Mesa de análise
      say("Mesa de análise", "Clique num card e a IA lê o número com você");
      await click(await mesa(), 550);
      await sleep(500);
      await click(await card("kpi-cpi"), 550);
      await waitAi(2600);

      say("Por que o CPI subiu?", "A IA decompõe em leilão, criativo e conversão, e avisa quando é defeito de coleta");
      const input = (await find($("#ai-question-input"))) as HTMLInputElement;
      await click(input, 550);
      await type(input, "Por que o CPI do Meta subiu?", 26);
      await sleep(150);
      hideOld();
      input.form?.requestSubmit();
      await waitAi(3400);

      say("Pergunte qualquer coisa sobre os dados", "Os números vêm do motor; a IA não calcula nem inventa");
      await type(input, "Qual canal paga o próprio custo em 90 dias?", 24);
      await sleep(150);
      hideOld();
      input.form?.requestSubmit();
      await waitAi(3200);

      await click(await mesa(), 500);
      await sleep(400);

      // 3 · visão geral: defeitos na linha do tempo e CPI corrigido
      say("Defeitos de coleta marcados na linha do tempo", "O CPI do Meta sobe a partir de 24/08: é atribuição perdida, não leilão");
      const serie = await card("card-serie");
      await show(serie);
      await scrub(await chartIn("card-serie", 1), 0.35, 0.95, 0.5, 1700);

      say("CPI corrigido ao lado do bruto", "Ninguém pausa campanha por causa de um defeito de tracking");
      const canais = await card("card-canais");
      await show(canais);
      const th = [...canais.querySelectorAll("th")].find((t) => t.textContent?.includes("corrigido"));
      if (th instanceof HTMLElement) await moveToEl(th, 550);
      await sleep(1400);

      say("Leilão e criativo por canal", "CPM, CTR, CPC e instalações por clique contra os 28 dias anteriores");
      const leilao = await card("card-leilao");
      await show(leilao);
      await moveToEl(leilao, 550, 0.4, 0.5);
      await sleep(1300);

      // 4 · saúde da coleta
      say("A prova: o orgânico sobe na mesma semana", "Instalações que o MMP deixa de atribuir viram orgânico");
      await go("tracking");
      const org = await card("card-organico");
      await show(org);
      await scrub(await chartIn("card-organico"), 0.15, 0.9, 0.45, 1600);
      const recon = document.querySelector<HTMLElement>('[data-ai-target="card-recon"]');
      if (recon) {
        say("Reconciliação GA4 × AppsFlyer × backend", "Cada fonte contra o nível normal do próprio canal");
        await show(recon);
        await moveToEl(recon, 550, 0.45, 0.4);
        await sleep(1200);
      }

      // 5 · canais e verba
      say("Retorno com intervalo de confiança e projeção", "Amostra baixa sinalizada; D90 real ao lado do projetado");
      await go("canais");
      const conf = await card("card-confianca");
      await show(conf);
      await moveToEl(conf, 550, 0.55, 0.35);
      await sleep(1400);

      say("Google: busca de marca separada do restante", "A marca infla o ROAS; para decidir verba vale a linha sem marca");
      const marca = await card("card-google-marca");
      await show(marca);
      await moveToEl(marca, 550, 0.6, 0.55);
      await sleep(1400);

      say("Simulador de verba com faixa de incerteza", "Curva de resposta por canal, retorno decrescente, mesmo orçamento total");
      const sim = await card("card-simulador");
      await show(sim, "start");
      const range = sim.querySelector<HTMLInputElement>('input[type="range"]');
      if (range) {
        await slide(range, 20, 40, 5);
        await sleep(900);
        await slide(range, 40, 20, -5);
      }
      await sleep(800);

      // 6 · testes
      say("Antes de mover verba, um teste", "Holdout geográfico, duração pelo volume, métrica de sucesso e travas");
      await go("testes");
      const plano = await card("card-plano-teste");
      await show(plano, "start");
      await moveToEl(plano, 550, 0.5, 0.45);
      await sleep(1500);
      const lift = document.querySelector<HTMLElement>('[data-ai-target="card-lift"]');
      if (lift) {
        say("Lift por teste, com intervalo de 95%", "Barra que cruza o zero não separa A de B; SRM em vermelho");
        await show(lift);
        await moveToEl(lift, 550, 0.6, 0.55);
        await sleep(1400);
      }

      // 7 · fechamento
      await go("geral");
      say("fluxo-media-compass.lovable.app", "Gabriel Rangel · dashboard web, motor de métricas testado, IA sobre dados determinísticos");
      await moveTo(window.innerWidth * 0.5, window.innerHeight * 0.7, 600);
      await sleep(3200);
    };

    run()
      .catch(() => undefined)
      .finally(() => {
        aiStore.close();
        setCaption(null);
        setOn(false);
        document.documentElement.classList.remove("demo-running");
      });

    return () => {
      stopped.current = true;
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("demo-running");
    };
  }, [on, navigate]);

  if (!on) return null;
  return (
    <>
      <div ref={cursorRef} className="pointer-events-none fixed left-0 top-0 z-[300]" style={{ transform: "translate(-100px,-100px)" }} aria-hidden>
        <div className="-translate-x-[5px] -translate-y-[3px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]">{CURSOR}</div>
        <AnimatePresence>
          <motion.span
            key={clickKey}
            className="absolute -left-4 -top-4 size-8 rounded-full border-2 border-[hsl(168_70%_45%)]"
            initial={{ scale: 0.3, opacity: clickKey ? 0.9 : 0 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex justify-center px-6">
      <AnimatePresence mode="wait">
        {caption && (
          <motion.div
            key={caption.title}
            className="max-w-[640px] rounded-xl bg-[hsl(222_38%_10%/0.92)] px-5 py-3.5 text-center text-white shadow-2xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            role="status"
          >
            <p className="font-display text-xl font-semibold leading-tight">{caption.title}</p>
            {caption.sub && <p className="mt-1 text-sm leading-snug text-white/75">{caption.sub}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}
