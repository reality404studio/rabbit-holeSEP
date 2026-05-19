import entriesJson from "../../data/entries.json";

export type Entry = { title: string; slug: string };

export const entries: Entry[] = entriesJson as Entry[];

export function buildEntriesText(): string {
  return entries.map((e) => `${e.slug} :: ${e.title}`).join("\n");
}

export function sepUrl(slug: string): string {
  return `https://plato.stanford.edu/entries/${slug}/`;
}

export function isValidSlug(slug: string): boolean {
  return entries.some((e) => e.slug === slug);
}
