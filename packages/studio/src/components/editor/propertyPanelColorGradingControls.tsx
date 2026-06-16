import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HF_COLOR_GRADING_PRESETS,
  normalizeHfColorGrading,
  type HfColorGradingAdjustKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { Minus, Plus, RotateCcw } from "../../icons/SystemIcons";
import { LUT_EXT } from "../../utils/mediaTypes";
import { LABEL } from "./propertyPanelHelpers";

const LUT_UPLOAD_DIR = "assets/luts";
const SLIDER_THUMB_SIZE = 10;
const SLIDER_THUMB_RADIUS = SLIDER_THUMB_SIZE / 2;

const SLIDERS: Array<{
  key: HfColorGradingAdjustKey;
  label: string;
  min: number;
  max: number;
  step: number;
  scale: number;
  suffix: string;
}> = [
  { key: "exposure", label: "Exposure", min: -200, max: 200, step: 5, scale: 100, suffix: "" },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  {
    key: "highlights",
    label: "Highlights",
    min: -100,
    max: 100,
    step: 1,
    scale: 100,
    suffix: "%",
  },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "whites", label: "Whites", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "temperature", label: "Warmth", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "tint", label: "Tint", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, scale: 100, suffix: "%" },
];

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatExposure(value: number): string {
  const stops = value / 100;
  return `${stops > 0 ? "+" : ""}${stops.toFixed(2)}`;
}

function fileLabel(path: string): string {
  return path.split("/").pop() ?? path;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatNumericInput(value: number, scale: number): string {
  const scaled = value / scale;
  return scale === 100 ? scaled.toFixed(2) : String(Math.round(scaled));
}

function parseNumericInput(value: string, scale: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed * scale;
}

function buildSliderTicks(min: number, max: number, neutral: number): number[] {
  const span = max - min;
  if (span <= 0) return [];
  const step = span <= 200 ? 50 : span / 4;
  const ticks = new Set<number>([min, max, neutral]);
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.add(Math.round(value));
  }
  return Array.from(ticks).sort((a, b) => a - b);
}

function tickPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function ColorGradingSliderControl({
  label,
  value,
  min,
  max,
  step,
  neutral = min,
  scale = 1,
  suffix = "",
  displayValue,
  disabled,
  onCommit,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  neutral?: number;
  scale?: number;
  suffix?: string;
  displayValue: string;
  disabled?: boolean;
  onCommit: (nextValue: number) => void;
  onReset?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [inputDraft, setInputDraft] = useState(() => formatNumericInput(value, scale));
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  const draftRef = useRef(value);
  valueRef.current = value;
  draftRef.current = draft;

  useEffect(() => {
    setDraft(value);
    draftRef.current = value;
    setInputDraft(formatNumericInput(value, scale));
  }, [scale, value]);

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const clampDraft = useCallback(
    (nextValue: number) => clampNumber(nextValue, min, max),
    [max, min],
  );

  const commitDraft = useCallback(
    (nextValue: number) => {
      const clamped = clampDraft(nextValue);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      setDraft(clamped);
      draftRef.current = clamped;
      setInputDraft(formatNumericInput(clamped, scale));
      if (clamped !== valueRef.current) onCommit(clamped);
    },
    [clampDraft, onCommit, scale],
  );

  const scheduleCommit = useCallback(
    (nextValue: number) => {
      const clamped = clampDraft(nextValue);
      setDraft(clamped);
      draftRef.current = clamped;
      setInputDraft(formatNumericInput(clamped, scale));
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        if (clamped !== valueRef.current) onCommit(clamped);
      }, 40);
    },
    [clampDraft, onCommit, scale],
  );

  const commitInputDraft = useCallback(() => {
    const parsed = parseNumericInput(inputDraft, scale);
    if (parsed === null) {
      setInputDraft(formatNumericInput(draft, scale));
      return;
    }
    commitDraft(parsed);
  }, [commitDraft, draft, inputDraft, scale]);

  const nudge = useCallback(
    (direction: -1 | 1) => {
      commitDraft(draftRef.current + step * direction);
    },
    [commitDraft, step],
  );

  const range = max - min;
  const valuePercent = range === 0 ? 0 : ((draft - min) / range) * 100;
  const neutralPercent = range === 0 ? 0 : ((neutral - min) / range) * 100;
  const fillLeft = Math.min(valuePercent, neutralPercent);
  const fillWidth = Math.abs(valuePercent - neutralPercent);
  const ticks = buildSliderTicks(min, max, neutral);

  return (
    <div className="grid min-w-0 gap-1.5 rounded-md bg-panel-input/30 p-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`${LABEL} min-w-0 flex-1 truncate`}>{label}</span>
        {onReset && (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Reset ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onReset();
            }}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-panel-text-5 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={`Reset ${label}`}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      <div className="relative h-7 min-w-0">
        <div
          data-color-grading-slider-track="true"
          className="pointer-events-none absolute inset-y-0 z-0"
          style={{ left: SLIDER_THUMB_RADIUS, right: SLIDER_THUMB_RADIUS }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              data-color-grading-slider-tick="true"
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-panel-text-3"
              style={{ left: `${tickPercent(tick, min, max)}%` }}
              title={String(tick / scale)}
            />
          ))}
          <div className="absolute left-0 right-0 top-1/2 z-10 h-0.5 -translate-y-1/2 rounded-full bg-panel-border" />
          <div
            className="absolute top-1/2 z-20 h-0.5 -translate-y-1/2 rounded-full bg-studio-accent"
            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={disabled}
          onChange={(event) => scheduleCommit(Number(event.currentTarget.value))}
          onMouseUp={() => commitDraft(draft)}
          onTouchEnd={() => commitDraft(draft)}
          onBlur={() => commitDraft(draft)}
          className="hf-color-grading-range absolute left-0 right-0 top-1/2 z-30 min-w-0 w-full -translate-y-1/2"
          title={displayValue}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <div className="flex flex-shrink-0 items-center rounded-md bg-panel-input px-1.5 py-1">
          <input
            type="number"
            value={inputDraft}
            min={min / scale}
            max={max / scale}
            step={step / scale}
            disabled={disabled}
            onChange={(event) => setInputDraft(event.currentTarget.value)}
            onBlur={commitInputDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                nudge(1);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                nudge(-1);
              }
            }}
            className="hf-color-grading-number h-5 w-[38px] bg-transparent text-right text-[11px] font-medium tabular-nums text-panel-text-1 outline-none disabled:cursor-not-allowed"
            title={displayValue}
          />
          {suffix && <span className="ml-0.5 text-[10px] text-panel-text-5">{suffix}</span>}
        </div>
        <div className="flex flex-shrink-0 overflow-hidden rounded-md bg-panel-input">
          <button
            type="button"
            disabled={disabled}
            aria-label={`Decrease ${label}`}
            onClick={() => nudge(-1)}
            className="flex h-7 w-5 items-center justify-center text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={`Decrease ${label}`}
          >
            <Minus size={11} />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Increase ${label}`}
            onClick={() => nudge(1)}
            className="flex h-7 w-5 items-center justify-center border-l border-panel-border text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={`Increase ${label}`}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ColorGradingControls({
  grading,
  assets,
  defaultColorGrading,
  onImportAssets,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  assets: string[];
  defaultColorGrading: NormalizedHfColorGrading;
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onCommitColorGrading: (nextGrading: NormalizedHfColorGrading) => void;
}) {
  const lutInputRef = useRef<HTMLInputElement>(null);
  const lutAssets = useMemo(
    () => assets.filter((asset) => LUT_EXT.test(asset)).sort((a, b) => a.localeCompare(b)),
    [assets],
  );
  const selectedLut = grading.lut?.src ?? "";
  const selectedProjectLut = selectedLut ? fileLabel(selectedLut) : null;

  const applyPreset = (preset: string) => {
    const next = normalizeHfColorGrading({ preset, intensity: 1 }) ?? defaultColorGrading;
    onCommitColorGrading(next);
  };
  const applyLut = (src: string | null, intensity = 1) => {
    onCommitColorGrading({
      ...grading,
      intensity: 1,
      lut: src ? { src, intensity } : null,
    });
  };
  const updateLutIntensity = (value: number) => {
    if (!grading.lut) return;
    applyLut(grading.lut.src, value / 100);
  };
  const importLuts = async (files: FileList | null) => {
    if (!files?.length || !onImportAssets) return;
    const uploaded = await onImportAssets(files, LUT_UPLOAD_DIR);
    const firstLut = uploaded.find((asset) => LUT_EXT.test(asset));
    if (firstLut) applyLut(firstLut, 1);
  };

  return (
    <div className="space-y-4">
      <label className="grid min-w-0 gap-1.5">
        <span className={LABEL}>Preset</span>
        <select
          value={String(grading.preset ?? "neutral")}
          onChange={(event) => applyPreset(event.target.value)}
          className="w-full min-w-0 rounded-md bg-panel-input px-3 py-2 text-[11px] font-medium text-panel-text-1 outline-none"
        >
          {HF_COLOR_GRADING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid min-w-0 gap-1.5">
        <span className={LABEL}>LUT Filter</span>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] gap-2">
          <select
            value={selectedLut}
            onChange={(event) => {
              const nextSrc = event.target.value;
              applyLut(
                nextSrc || null,
                nextSrc && grading.lut?.src === nextSrc ? grading.lut.intensity : 1,
              );
            }}
            className="w-full min-w-0 rounded-md bg-panel-input px-3 py-2 text-[11px] font-medium text-panel-text-1 outline-none"
            title="Uploaded .cube LUT filter"
          >
            <option value="">None</option>
            {lutAssets.length > 0 && (
              <optgroup label="Uploaded LUTs">
                {lutAssets.map((asset) => (
                  <option key={asset} value={asset}>
                    {fileLabel(asset)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            disabled={!onImportAssets}
            onClick={(event) => {
              event.stopPropagation();
              lutInputRef.current?.click();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-panel-input text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title="Import .cube LUT"
            aria-label="Import .cube LUT"
          >
            <Plus size={13} />
          </button>
          <input
            ref={lutInputRef}
            type="file"
            accept=".cube"
            multiple
            className="hidden"
            onChange={(event) => {
              void importLuts(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {grading.lut && (
          <div className="grid gap-2">
            {selectedProjectLut && (
              <div className="flex min-w-0 items-start gap-2 text-[10px] leading-4 text-panel-text-3">
                <span className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-studio-accent" />
                <span className="min-w-0">
                  <span className="font-medium text-panel-text-2">Uploaded LUT</span>
                  {` · ${selectedProjectLut}`}
                </span>
              </div>
            )}
            <ColorGradingSliderControl
              label="LUT Strength"
              value={Math.round((grading.lut.intensity ?? 1) * 100)}
              min={0}
              max={100}
              step={1}
              neutral={0}
              suffix="%"
              displayValue={formatPercent((grading.lut.intensity ?? 1) * 100)}
              onCommit={updateLutIntensity}
              onReset={() => updateLutIntensity(100)}
            />
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3">
        {SLIDERS.map((slider) => {
          const value = grading.adjust[slider.key] * slider.scale;
          const isExposure = slider.key === "exposure";
          return (
            <div
              key={slider.key}
              className={
                SLIDERS.length % 2 === 1 && slider.key === "saturation" ? "col-span-2" : ""
              }
            >
              <ColorGradingSliderControl
                label={slider.label}
                value={Math.round(value)}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                neutral={0}
                scale={isExposure ? 100 : 1}
                suffix={isExposure ? "" : slider.suffix}
                displayValue={isExposure ? formatExposure(value) : formatPercent(value)}
                onCommit={(next) => {
                  onCommitColorGrading({
                    ...grading,
                    intensity: 1,
                    adjust: {
                      ...grading.adjust,
                      [slider.key]: next / slider.scale,
                    },
                  });
                }}
                onReset={() => {
                  onCommitColorGrading({
                    ...grading,
                    intensity: 1,
                    adjust: {
                      ...grading.adjust,
                      [slider.key]: 0,
                    },
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
