export interface Term { t: string; n: number }

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further get got had has have having he her here hers him his how i if in into is it its just like make may more most my no nor not now of off on once one only or other our out over own per same she should so some such than that the their them then there these they this those through to too under until up us use used using very was we were what when where which while who whom why will with would you your yours`.split(/\s+/));
const WORD = /[\p{L}][\p{L}\p{N}'’-]*/gu;

/** Most-used words and two-word phrases in a page's visible text. Plain counting, no AI; tuned for English, noisy elsewhere. */
export function extractTerms(text: string, limit = 12): Term[] {
  const words = (text.toLowerCase().match(WORD) ?? []).map((w) => w.replace(/^['’-]+|['’-]+$/g, ""));
  const keep = (w: string) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);
  const uni = new Map<string, number>(), bi = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const a = words[i]!;
    if (keep(a)) uni.set(a, (uni.get(a) ?? 0) + 1);
    const b = words[i + 1];
    if (b && keep(a) && keep(b)) { const k = `${a} ${b}`; bi.set(k, (bi.get(k) ?? 0) + 1); }
  }
  const rows: Term[] = [
    ...[...uni].filter(([, n]) => n >= 3).map(([t, n]) => ({ t, n })),
    ...[...bi].filter(([, n]) => n >= 2).map(([t, n]) => ({ t, n })),
  ];
  // A phrase that explains a word (same count) makes that word redundant.
  const phrases = rows.filter((r) => r.t.includes(" "));
  const kept = rows.filter((r) => r.t.includes(" ") || !phrases.some((p) => p.n >= r.n && p.t.split(" ").includes(r.t)));
  return kept.sort((a, b) => b.n - a.n || b.t.length - a.t.length).slice(0, limit);
}
