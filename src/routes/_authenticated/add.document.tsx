import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { AnalyzerShell, useMediaAnalyzer } from "@/components/MediaAnalyzer";

export const Route = createFileRoute("/_authenticated/add/document")({
  head: () => ({
    meta: [
      { title: "Importer un document — StudyLoop" },
      { name: "description", content: "Importe un PDF ou un fichier texte et obtiens une fiche de synthèse." },
      { property: "og:title", content: "Importer un document — StudyLoop" },
      { property: "og:description", content: "PDF et texte transformés en fiches, flashcards et quiz." },
    ],
  }),
  component: DocumentPage,
});

function DocumentPage() {
  const { t } = useI18n();
  const analyzer = useMediaAnalyzer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <PageHeader title={t("document.title")} />
      <AnalyzerShell
        analyzer={analyzer}
        disabled={!file}
        submitLabel={t("document.analyze")}
        onSubmit={() =>
          file &&
          analyzer.analyze({
            file,
            fileName: file.name.replace(/\.[^.]+$/, ""),
            kind: "pdf",
            mimeType: file.type || "application/pdf",
          })
        }
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press card-soft flex w-full flex-col items-center gap-2 border-dashed p-8 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-success/10 text-success">
            {file ? <FileText className="size-6" /> : <Upload className="size-6" />}
          </span>
          <span className="font-semibold">{file ? file.name : t("document.pick")}</span>
          <span className="text-xs text-muted-foreground">{t("upload.limit")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </AnalyzerShell>
    </>
  );
}
