import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Headphones, Upload } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { AnalyzerShell, useMediaAnalyzer } from "@/components/MediaAnalyzer";

export const Route = createFileRoute("/_authenticated/add/audio")({
  head: () => ({
    meta: [
      { title: "Importer un audio — StudyLoop" },
      { name: "description", content: "Importe un fichier audio de cours et obtiens transcription et fiche." },
      { property: "og:title", content: "Importer un audio — StudyLoop" },
      { property: "og:description", content: "MP3, M4A, WAV : ton cours devient une fiche de révision." },
    ],
  }),
  component: AudioPage,
});

function AudioPage() {
  const { t } = useI18n();
  const analyzer = useMediaAnalyzer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <PageHeader title={t("audio.title")} />
      <AnalyzerShell
        analyzer={analyzer}
        disabled={!file}
        submitLabel={t("audio.analyze")}
        onSubmit={() =>
          file &&
          analyzer.analyze({
            file,
            fileName: file.name.replace(/\.[^.]+$/, ""),
            kind: "audio",
            mimeType: file.type || "audio/mpeg",
          })
        }
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press card-soft flex w-full flex-col items-center gap-2 border-dashed p-8 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-chart-4/10 text-chart-4">
            {file ? <Headphones className="size-6" /> : <Upload className="size-6" />}
          </span>
          <span className="font-semibold">{file ? file.name : t("audio.pick")}</span>
          <span className="text-xs text-muted-foreground">{t("upload.limit")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </AnalyzerShell>
    </>
  );
}
