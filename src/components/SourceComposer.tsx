import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { fetchSpaces } from "@/lib/spaces";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProcessingSteps } from "@/components/ProcessingSteps";
import { stageToIndex } from "@/lib/analysisDrive";
import { cn } from "@/lib/utils";

export type DetailLevel = "quick" | "standard" | "detailed" | "exam";

export function useComposerState() {
  const { settings } = useSettings();
  const spaces = useQuery({ queryKey: ["spaces"], queryFn: fetchSpaces });
  const [spaceId, setSpaceId] = useState<string>("");
  const [detailLevel, setDetailLevel] = useState<DetailLevel | "">("");

  const effectiveSpaceId = spaceId || spaces.data?.[0]?.id || "";
  const effectiveDetail = (detailLevel || settings?.detail_level || "standard") as DetailLevel;
  const outputLanguage = settings?.ai_output_language ?? "same";

  return {
    spaces,
    spaceId: effectiveSpaceId,
    setSpaceId,
    detailLevel: effectiveDetail,
    setDetailLevel,
    outputLanguage,
  };
}

export function SpaceAndDetailPicker({ state }: { state: ReturnType<typeof useComposerState> }) {
  const { t } = useI18n();
  const levels: DetailLevel[] = ["quick", "standard", "detailed", "exam"];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("nav.spaces")}</Label>
        <Select value={state.spaceId} onValueChange={state.setSpaceId}>
          <SelectTrigger className="h-12 rounded-xl">
            <SelectValue placeholder={t("space.new")} />
          </SelectTrigger>
          <SelectContent>
            {(state.spaces.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("detail.label")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {levels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => state.setDetailLevel(l)}
              className={cn(
                "press rounded-xl border px-3 py-2.5 text-sm font-medium",
                state.detailLevel === l
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {t(`detail.${l}` as const)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalysisProgress({ stage }: { stage: string }) {
  const { t } = useI18n();
  return (
    <div className="card-soft animate-rise p-5">
      <div className="mb-4 flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <p className="font-semibold">{t("processing.title")}</p>
      </div>
      <ProcessingSteps
        steps={[
          t("processing.step.upload"),
          t("processing.step.transcribe"),
          t("processing.step.analyze"),
          t("processing.step.notes"),
          t("processing.step.review"),
        ]}
        current={stageToIndex(stage)}
      />
      <p className="mt-4 text-xs text-muted-foreground">{t("processing.keepOpen")}</p>
    </div>
  );
}
