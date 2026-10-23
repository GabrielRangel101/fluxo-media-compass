import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { aiStore } from "@/components/ai/ai-store";
import { commandStore } from "@/components/shell/command-store";
import type { ViewId } from "@/lib/dashboard-data";

/**
 * Modo demo: abra com ?demo=1 (ou #demo). Roda um roteiro sozinho sobre a interface real, com cursor animado e legendas,
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
      if (e.key === "Escape" && !commandStore.get()) stopped.current = true;
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
      await sleep(550);
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
      commandStore.set(false);
      void navigate({ to: "/", search: { view: "geral" } });
      place(window.innerWidth * 0.5, window.innerHeight * 0.7);
      await sleep(1800);

      // 1 · abertura rápida
      say("Gazeta Meridiano", "Inteligência de assinaturas B2C · dados sintéticos, motor de métricas próprio");
      for (const k of ["kpi-active", "kpi-churn", "kpi-mrr"]) {
        await moveToEl(await find($(`[data-ai-target="${k}"]`)), 380);
        await sleep(120);
      }

      // 2 · Modo IA logo de cara
      say("Mesa de análise", "Clique num card e a IA lê o gráfico com você");
      await click(await mesa(), 550);
      await sleep(500);
      await click(await find($('[data-ai-target="kpi-churn"]')), 550);
      await waitAi(2200);

      say("Perguntas de negócio, em linguagem natural", "Os números vêm do motor; a IA não inventa dados");
      const input = (await find($("#ai-question-input"))) as HTMLInputElement;
      await click(input, 550);
      await type(input, "Se eu abaixar o preço, melhora o churn?", 24);
      await sleep(150);
      hideOld();
      input.form?.requestSubmit();
      await waitAi(3200);

      say("Não entendeu a métrica? Ela explica a conta", "Fórmula, exemplo com os números do mês e como ler");
      await type(input, "Como é calculada a saúde por editoria?", 24);
      await sleep(150);
      hideOld();
      input.form?.requestSubmit();
      await waitAi(3000);

      await click(await mesa(), 500);
      await sleep(350);

      // 3 · visão geral
      say("Cada gráfico conta o que aconteceu", "Campanhas, reajuste e eventos marcados na linha do tempo");
      await scrub(await find($('[data-ai-target="evolution"]')), 0.15, 0.85, 0.55, 1500);

      // 4 · aquisição
      say("Funil de ponta a ponta e eficiência por canal", "Do visitante à compra · CAC, LTV, LTV/CAC e payback");
      await go("aquisicao");
      await moveToEl(await find($("#funnel-card")), 550, 0.3, 0.5);
      await sleep(900);
      await moveToEl(await find($("#acq-quality-card")), 550, 0.6, 0.45);
      await sleep(1100);

      // 5 · retenção
      say("Retenção por safra e saúde por editoria", "Curvas de permanência (Kaplan-Meier) e ponte de MRR");
      await go("retencao");
      await moveToEl(await find($('[data-ai-target="cohort"]')), 550, 0.5, 0.5);
      await sleep(1100);
      const ed = document.querySelector<HTMLElement>('[data-ai-target="editorias"]');
      if (ed) {
        await moveToEl(ed, 500);
        await sleep(900);
      }

      // 6 · risco
      say("Quem está prestes a cancelar", "Risco por assinante, gatilho e correlação entre métricas");
      await go("risco");
      await moveToEl(await find($('[data-ai-target="risk-map"]')), 550, 0.45, 0.45);
      await sleep(1400);

      // 7 · simulador
      say("Simulador: o que falta para bater a meta", "Churn, falha de pagamento e aquisição sobre a mesma projeção");
      await go("simulador");
      await click(await find(byText("button", "Cenário prudente")), 550);
      await sleep(1500);
      const close = await find(byText("button", "Fechar a meta com aquisição"));
      if (!(close as HTMLButtonElement).disabled) {
        await click(close, 450);
        await sleep(1700);
      }
      await click(await find(byText("button", "Zerar")), 400);

      // 8 · Ctrl+K
      say("Ctrl+K: vá direto a qualquer aba ou card");
      await moveTo(window.innerWidth * 0.5, window.innerHeight * 0.4, 450);
      commandStore.set(true);
      await sleep(400);
      const cmd = await find(() => document.querySelector<HTMLInputElement>('input[placeholder^="Ir para uma aba"]'));
      await type(cmd as HTMLInputElement, "visão", 70);
      await sleep(500);
      cmd.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await sleep(900);

      // 9 · fechamento
      void navigate({ to: "/", search: { view: "geral" } });
      say("gazetameridiano.app", "Dashboard web · motor de métricas · IA sobre dados determinísticos");
      await moveTo(window.innerWidth * 0.5, window.innerHeight * 0.7, 600);
      await sleep(3000);
    };

    run()
      .catch(() => undefined)
      .finally(() => {
        aiStore.close();
        commandStore.set(false);
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
            className="absolute -left-4 -top-4 size-8 rounded-full border-2 border-[hsl(38_88%_50%)]"
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
            className="max-w-[640px] rounded-xl bg-[hsl(205_38%_10%/0.92)] px-5 py-3.5 text-center text-white shadow-2xl"
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
