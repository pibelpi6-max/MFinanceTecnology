"use client";

import { useTranslations } from "next-intl";
import type { ImportStep } from "@/lib/import/types";

const STEPS: ImportStep[] = ["mapping", "review", "done"];

export function ImportStepIndicator({ current }: { current: ImportStep }) {
  const t = useTranslations("import.steps");
  if (current === "upload") return null;

  const currentIndex = STEPS.indexOf(current);

  return (
    <div className="import-step-indicator">
      {STEPS.map((step, i) => (
        <div key={step} className={`import-step ${i === currentIndex ? "current" : i < currentIndex ? "done" : "upcoming"}`}>
          <span className="import-step-dot">{i < currentIndex ? "✓" : i + 1}</span>
          <span className="import-step-label">{t(step)}</span>
          {i < STEPS.length - 1 && <span className="import-step-line" />}
        </div>
      ))}
    </div>
  );
}
