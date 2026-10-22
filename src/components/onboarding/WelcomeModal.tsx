import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import keelmen from "@/assets/onboarding/welcome-keelmen.jpg";
import shotEditor from "@/assets/onboarding/welcome-shot-editor.webp";
import shotMap from "@/assets/onboarding/welcome-shot-map.webp";
import shotFolio from "@/assets/onboarding/welcome-shot-folio.webp";

const PANES = [
  { key: "editor", shot: shotEditor },
  { key: "map", shot: shotMap },
  { key: "folio", shot: shotFolio },
] as const;

const ROTATE_MS = 5000;

interface WelcomeModalProps {
  open?: boolean;
  onClose: () => void;
  onStart: () => void;
  onExample: () => void;
  startBusy?: boolean;
}

export default function WelcomeModal({ open = true, onClose, onStart, onExample, startBusy }: WelcomeModalProps) {
  const { t } = useTranslation();
  const paneText = (key: string) => ({
    label: t(`onboarding.welcome.panes.${key}.label`),
    title: t(`onboarding.welcome.panes.${key}.title`),
    alt: t(`onboarding.welcome.panes.${key}.alt`),
  });
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || manual || lightbox) return;
    timer.current = setTimeout(() => setI((n) => (n + 1) % PANES.length), ROTATE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, manual, lightbox, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onClose]);

  if (!open) return null;
  const pane = PANES[i];
  const pick = (n: number) => {
    if (timer.current) clearTimeout(timer.current);
    setManual(true);
    setI(n);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(22,19,14,.42)] px-[4vw] py-[3vh] font-mono">
      <div className="grid w-full max-w-[1040px] max-h-[94vh] grid-cols-1 md:grid-cols-[0.72fr_1.28fr] grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#fbfaf8] text-[#16130e] shadow-[0_40px_90px_rgba(22,19,14,.45)]">
        <div className="relative hidden md:block min-h-0 overflow-hidden bg-[#16130e]">
          <img src={keelmen} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,19,14,0)_45%,rgba(22,19,14,.85))]" />
          <div className="relative flex h-full flex-col justify-end px-[22px] py-[24px]">
            <div className="text-[10px] uppercase tracking-[.22em] text-[rgba(243,234,214,.6)]">
              J. M. W. Turner · Keelmen
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-auto px-6 md:px-9 pb-[22px] pt-[30px]">
          <div className="flex flex-none items-start justify-between gap-5">
            <div className="flex-1 md:pl-8 text-center">
              <div className="mb-[10px] text-[11px] uppercase tracking-[.28em] text-[#b8291f]">{t("onboarding.welcome.kicker")}</div>
              <h1 className="m-0 font-serif text-[28px] md:text-[36px] font-normal leading-[1.02] tracking-[-1.1px]">
                {t("onboarding.welcome.heading")}
              </h1>
            </div>
            <button
              onClick={onClose}
              aria-label={t("onboarding.welcome.close")}
              className="flex-none px-[9px] py-[6px] text-[18px] leading-none text-[rgba(22,19,14,.5)] hover:bg-[rgba(22,19,14,.06)] hover:text-[#16130e]"
            >
              ✕
            </button>
          </div>

          <div className="mt-[18px] flex flex-none justify-center">
            <div className="inline-flex items-center gap-[3px] rounded-full border-[1.5px] border-[rgba(22,19,14,.12)] bg-[#f1efeb] p-1">
              {PANES.map((p, n) => (
                <button
                  key={p.key}
                  onClick={() => pick(n)}
                  className={`rounded-full px-3 md:px-4 py-2 text-[10px] md:text-[11px] font-bold uppercase tracking-[.07em] transition-colors ${
                    n === i
                      ? "bg-[#f23a3d] text-white shadow-[0_5px_14px_rgba(242,58,61,.3)]"
                      : "bg-transparent text-[rgba(22,19,14,.6)] hover:opacity-85"
                  }`}
                >
                  {paneText(p.key).label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-none flex-col items-center justify-center gap-7">
            <button
              onClick={() => {
                setLightbox(true);
                setManual(true);
              }}
              aria-label={t("onboarding.welcome.enlargeAria", { label: paneText(pane.key).label })}
              className="relative w-full flex-none cursor-zoom-in overflow-hidden border-[1.5px] border-[rgba(22,19,14,.18)] bg-[#16130e]"
              style={{ aspectRatio: "1600 / 637" }}
            >
              <img src={pane.shot} alt={paneText(pane.key).alt} loading="lazy" className="block h-full w-full bg-[#16130e] object-cover object-left-top" />
              <span className="absolute bottom-[9px] right-[9px] bg-[rgba(22,19,14,.82)] px-[10px] py-[6px] text-[9.5px] uppercase tracking-[.18em] text-[#f3ead6]">
                {t("onboarding.welcome.enlarge")}
              </span>
            </button>
            <h2 className="m-0 flex-none text-center font-serif text-[19px] md:text-[22px] font-light italic leading-[1.25] text-[#4a443a]">
              {paneText(pane.key).title}
            </h2>
          </div>

          <div className="mt-7 flex flex-none flex-wrap items-center justify-between gap-[18px] border-t-[1.5px] border-[rgba(22,19,14,.16)] pt-4">
            <div className="flex items-center gap-2">
              {PANES.map((p, n) => (
                <button
                  key={p.key}
                  onClick={() => pick(n)}
                  aria-label={t("onboarding.welcome.showPane", { label: paneText(p.key).label })}
                  className={`h-1 w-6 transition-colors ${n === i ? "bg-[#f23a3d]" : "bg-[rgba(22,19,14,.2)]"}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onExample}
                className="rounded-full border-[1.5px] border-[rgba(22,19,14,.3)] px-[19px] py-[13px] text-[12.5px] uppercase tracking-[.06em] hover:border-[#16130e] hover:bg-[rgba(22,19,14,.05)]"
              >
                {t("onboarding.welcome.example")}
              </button>
              <button
                onClick={onStart}
                disabled={startBusy}
                className="rounded-full bg-[#f23a3d] px-[26px] py-[14px] text-[12.5px] font-bold uppercase tracking-[.06em] text-white shadow-[0_10px_24px_rgba(242,58,61,.28)] hover:bg-[#d3282c] active:bg-[#b8221f] disabled:opacity-60"
              >
                {startBusy ? t("onboarding.welcome.creating") : t("onboarding.welcome.start")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-[rgba(12,10,8,.9)] px-[4vw] py-[4vh]"
        >
          <img src={pane.shot} alt={paneText(pane.key).alt} className="max-h-full max-w-full object-contain shadow-[0_30px_80px_rgba(0,0,0,.6)]" />
          <div className="absolute right-[22px] top-[18px] text-[11px] uppercase tracking-[.2em] text-[rgba(243,234,214,.75)]">
            {t("onboarding.welcome.lightboxClose")}
          </div>
        </div>
      )}
    </div>
  );
}
