import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { AnalyzerShell, useMediaAnalyzer } from "@/components/MediaAnalyzer";

export const Route = createFileRoute("/_authenticated/add/record")({
  head: () => ({
    meta: [
      { title: "Enregistrer un cours — StudyLoop" },
      { name: "description", content: "Enregistre ton cours en direct et laisse l'IA le transcrire et le résumer." },
      { property: "og:title", content: "Enregistrer un cours — StudyLoop" },
      { property: "og:description", content: "Appuie sur enregistrer, révise ensuite." },
    ],
  }),
  component: RecordPage,
});

function format(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function RecordPage() {
  const { t } = useI18n();
  const analyzer = useMediaAnalyzer();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setBlob(null);
      setSeconds(0);
      setRecording(true);
    } catch {
      toast.error(t("error.mic"));
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
    setDuration(seconds);
  }

  return (
    <>
      <PageHeader title={t("record.title")} />
      <AnalyzerShell
        analyzer={analyzer}
        disabled={!blob}
        submitLabel={t("record.analyze")}
        onSubmit={() =>
          blob &&
          analyzer.analyze({
            file: blob,
            fileName: `${t("record.title")} · ${new Date().toLocaleDateString()}`,
            kind: "recording",
            mimeType: blob.type || "audio/webm",
            durationSeconds: duration,
          })
        }
      >
        <div className="card-soft flex flex-col items-center gap-4 p-8">
          <p className="font-mono text-4xl font-semibold tabular-nums">{format(recording ? seconds : duration)}</p>
          <button
            type="button"
            onClick={recording ? stop : start}
            className={`press flex size-20 items-center justify-center rounded-full ${
              recording ? "bg-destructive text-destructive-foreground animate-pulse-ring" : "bg-primary text-primary-foreground"
            }`}
            aria-label={recording ? t("record.stop") : t("record.start")}
          >
            {recording ? <Square className="size-7" /> : <Mic className="size-8" />}
          </button>
          <p className="text-sm text-muted-foreground">
            {recording ? t("record.recording") : blob ? t("record.ready") : t("record.hint")}
          </p>
        </div>
      </AnalyzerShell>
    </>
  );
}
