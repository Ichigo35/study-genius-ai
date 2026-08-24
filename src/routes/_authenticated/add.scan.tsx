import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { AnalyzerShell, useMediaAnalyzer } from "@/components/MediaAnalyzer";

export const Route = createFileRoute("/_authenticated/add/scan")({
  head: () => ({
    meta: [
      { title: "Scanner des notes — StudyLoop" },
      { name: "description", content: "Photographie tes notes manuscrites ou un tableau et obtiens une fiche claire." },
      { property: "og:title", content: "Scanner des notes — StudyLoop" },
      { property: "og:description", content: "L'IA lit tes notes manuscrites et les met au propre." },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const { t } = useI18n();
  const analyzer = useMediaAnalyzer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <>
      <PageHeader title={t("scan.title")} />
      <AnalyzerShell
        analyzer={analyzer}
        disabled={!file}
        submitLabel={t("scan.analyze")}
        onSubmit={() =>
          file &&
          analyzer.analyze({
            file,
            fileName: t("scan.title"),
            kind: "image",
            mimeType: file.type || "image/jpeg",
          })
        }
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press card-soft flex w-full flex-col items-center gap-2 overflow-hidden p-8 text-center"
        >
          {preview ? (
            <img src={preview} alt={t("scan.title")} className="max-h-60 rounded-xl object-contain" />
          ) : (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary">
                <Camera className="size-6" />
              </span>
              <span className="font-semibold">{t("scan.pick")}</span>
              <span className="text-xs text-muted-foreground">{t("upload.limit")}</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </AnalyzerShell>
    </>
  );
}
