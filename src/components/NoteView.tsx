import { useI18n } from "@/i18n";

export interface NoteContent {
  title: string;
  summary: string;
  keyPoints: string[];
  concepts: { term: string; definition: string }[];
  mustKnow: string[];
  facts: string[];
  examples: string[];
  examTopics: string[];
  simpleExplanation: string;
  potentialQuestions: string[];
  outline: string[];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-soft p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-2 text-[0.95rem] leading-relaxed">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function NoteView({ note }: { note: NoteContent }) {
  const { t } = useI18n();
  const has = (arr?: unknown[]) => Array.isArray(arr) && arr.length > 0;

  return (
    <div className="space-y-3">
      {note.summary && <Section title={t("note.summary")}>{note.summary}</Section>}
      {has(note.keyPoints) && (
        <Section title={t("note.keyPoints")}>
          <List items={note.keyPoints} />
        </Section>
      )}
      {has(note.concepts) && (
        <Section title={t("note.concepts")}>
          <dl className="space-y-2">
            {note.concepts.map((c, i) => (
              <div key={i}>
                <dt className="font-semibold">{c.term}</dt>
                <dd className="text-muted-foreground">{c.definition}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {has(note.mustKnow) && (
        <Section title={t("note.mustKnow")}>
          <List items={note.mustKnow} />
        </Section>
      )}
      {has(note.facts) && (
        <Section title={t("note.facts")}>
          <List items={note.facts} />
        </Section>
      )}
      {has(note.examples) && (
        <Section title={t("note.examples")}>
          <List items={note.examples} />
        </Section>
      )}
      {has(note.examTopics) && (
        <Section title={t("note.exam")}>
          <List items={note.examTopics} />
        </Section>
      )}
      {note.simpleExplanation && <Section title={t("note.simple")}>{note.simpleExplanation}</Section>}
      {has(note.potentialQuestions) && (
        <Section title={t("note.questions")}>
          <List items={note.potentialQuestions} />
        </Section>
      )}
      {has(note.outline) && (
        <Section title={t("note.outline")}>
          <List items={note.outline} />
        </Section>
      )}
    </div>
  );
}
