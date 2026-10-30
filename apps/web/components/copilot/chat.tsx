"use client";
import { useRef, useState, useTransition } from "react";
import { askCopilot } from "@/app/(app)/copilot/actions";

type Msg = { role: "user" | "assistant"; text: string; figures?: { label: string; value: string }[]; followUps?: string[]; unverified?: string[]; cannot?: boolean; error?: boolean };

const ICON = {
  trend: <path d="M3 17l5-6 4 3 6-8M14 6h4v4" />,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.2-5 1.2-5 3.4 0 1 1 1.6 2.5 1.6s2.5-.6 2.5-1.5" /></>,
  route: <path d="M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM7 17h6a3 3 0 000-6h-2a3 3 0 010-6h6" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
};
const STARTERS: { q: string; label: string; hint: string; icon: keyof typeof ICON; needs?: string }[] = [
  { q: "How did the last 30 days go?", label: "Recap my month", hint: "Spend, sales and what changed", icon: "trend" },
  { q: "Which Allegro offers lose money?", label: "Find money-losers", hint: "Offers below break-even", icon: "coin", needs: "Allegro" },
  { q: "Where do my orders come from?", label: "Trace my orders", hint: "Channels and marketing sources", icon: "route" },
  { q: "What should I look at first this week?", label: "Pick my priorities", hint: "The one thing to act on", icon: "spark" },
];
const Svg = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;

/** Answers are shown as plain text only. Nothing the model returns is ever rendered as HTML. */
export function CopilotChat({ sources }: { sources: string[] }) {
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
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    start(async () => {
      const r = await askCopilot({ question, history, days });
      setMsgs((m) => [...m, r.ok ? { role: "assistant", text: r.answer.answer, figures: r.answer.figures, followUps: r.answer.followUps, unverified: r.answer.unverified, cannot: r.answer.cannotAnswer } : { role: "assistant", text: r.error, error: true }]);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
      <div className="cp-hero">
        <div className="cp-orb" aria-hidden />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>Ask anything about your numbers</div>
          <div className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>Answers come from your connected accounts, with the figures shown so you can check them.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {sources.length === 0 ? <span className="eyebrow">No accounts connected yet</span> : sources.map((s) => <span key={s} className="badge" style={{ marginLeft: 0 }}>● {s}</span>)}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Look at the last</div>
          <div className="cp-seg" role="group" aria-label="Period">
            {[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>)}
          </div>
        </div>
      </div>

      {msgs.length === 0 && (
        <div className="cp-starters">
          {STARTERS.filter((s) => !s.needs || sources.includes(s.needs)).map((s, i) => (
            <button key={s.q} type="button" className="cp-starter raise3d rise" style={{ "--i": i } as React.CSSProperties} onClick={() => ask(s.q)}>
              <span className="ic"><Svg>{ICON[s.icon]}</Svg></span>
              <b style={{ fontWeight: 600 }}>{s.label}</b>
              <span className="sub" style={{ margin: 0, fontSize: 12 }}>{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`cp-msg${m.role === "user" ? " me" : ""}`}>
            {m.role === "assistant" && <span className="cp-orb sm" aria-hidden />}
            <div className="cp-bubble" style={m.error ? { borderColor: "var(--neg)", color: "var(--neg)" } : undefined}>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
              {m.figures && m.figures.length > 0 && (
                <div className="cp-figs">{m.figures.map((f) => <div className="cp-fig" key={f.label}><div className="eyebrow">{f.label}</div><div className="tabnum" style={{ fontWeight: 600, fontSize: 16 }}>{f.value}</div></div>)}</div>
              )}
              {m.unverified && m.unverified.length > 0 && <div style={{ fontSize: 12, color: "var(--warn)" }}>Check before relying on this: {m.unverified.join(", ")} could not be matched to your data.</div>}
              {m.followUps && m.followUps.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{m.followUps.map((f) => <button key={f} type="button" className="nav-item" onClick={() => ask(f)} style={{ width: "fit-content", cursor: "pointer", border: "1px solid var(--line2)", fontSize: 12, padding: "5px 10px" }}>{f}</button>)}</div>
              )}
            </div>
          </div>
        ))}
        {pending && <div className="cp-msg"><span className="cp-orb sm" aria-hidden /><div className="cp-typing" aria-label="Looking at your numbers"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>

      <form className="cp-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your sales, ads, offers or SEO" maxLength={500} aria-label="Your question" />
        <button className="cp-send" disabled={pending || text.trim().length < 2} aria-label="Send"><Svg size={18}><path d="M5 12h14M13 6l6 6-6 6" /></Svg></button>
      </form>
      <p className="sub" style={{ fontSize: 12, margin: 0 }}>Copilot reads a summary of your workspace numbers and answers from it. It is read-only and cannot change anything. Figures it quotes are checked against your data, and anything it could not match is flagged.</p>
    </div>
  );
}
