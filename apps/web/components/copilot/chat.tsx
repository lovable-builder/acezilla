"use client";
import { useRef, useState, useTransition } from "react";
import { askCopilot } from "@/app/(app)/copilot/actions";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; text: string; figures?: { label: string; value: string }[]; followUps?: string[]; unverified?: string[]; cannot?: boolean; error?: boolean };
const STARTERS = ["How did the last 30 days go?", "Which Allegro offers lose money?", "Where do my orders come from?", "What should I look at first this week?"];

/** Answers are shown as plain text only. Nothing the model returns is ever rendered as HTML. */
export function CopilotChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [days, setDays] = useState(30);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setText("");
    start(async () => {
      const r = await askCopilot({ question, history, days });
      setMsgs((m) => [...m, r.ok ? { role: "assistant", text: r.answer.answer, figures: r.answer.figures, followUps: r.answer.followUps, unverified: r.answer.unverified, cannot: r.answer.cannotAnswer } : { role: "assistant", text: r.error, error: true }]);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label className="eyebrow" htmlFor="cp-days">Look at the last</label>
        <select id="cp-days" className="field" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: "5px 8px" }}>
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </div>

      {msgs.length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STARTERS.map((s) => <button key={s} type="button" className="nav-item" onClick={() => ask(s)} style={{ width: "fit-content", cursor: "pointer", border: "1px solid var(--line2)" }}>{s}</button>)}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%", background: m.role === "user" ? "var(--accent-soft)" : "var(--surface)", color: m.error ? "var(--neg)" : m.role === "user" ? "var(--accent-ink)" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
            {m.figures && m.figures.length > 0 && (
              <div className="mono tabnum" style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--ink3)" }}>{m.figures.map((f) => <span key={f.label}>{f.label}: <b style={{ color: "var(--ink)" }}>{f.value}</b></span>)}</div>
            )}
            {m.unverified && m.unverified.length > 0 && <div style={{ fontSize: 12, color: "var(--warn)" }}>Check before relying on this: {m.unverified.join(", ")} could not be matched to your data.</div>}
            {m.followUps && m.followUps.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{m.followUps.map((f) => <button key={f} type="button" className="nav-item" onClick={() => ask(f)} style={{ width: "fit-content", cursor: "pointer", border: "1px solid var(--line2)", fontSize: 12, padding: "4px 10px" }}>{f}</button>)}</div>
            )}
          </div>
        ))}
        {pending && <div className="eyebrow">Looking at your numbers…</div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} style={{ display: "flex", gap: 8 }}>
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your sales, ads, offers or SEO" maxLength={500} aria-label="Your question" style={{ flex: 1 }} />
        <Button disabled={pending || text.trim().length < 2}>Ask</Button>
      </form>
      <p className="sub" style={{ fontSize: 12, margin: 0 }}>Copilot reads a summary of your workspace numbers and answers from it. It is read-only and cannot change anything. Figures it quotes are checked against your data, and anything it cannot match is flagged.</p>
    </div>
  );
}
