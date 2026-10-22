import { GLOSSARY } from "@/lib/glossary";

/** A label with a short plain-language explanation on hover or keyboard focus. */
export function Term({ children, k }: { children: string; k?: string }) {
  const tip = GLOSSARY[k ?? children];
  if (!tip) return <>{children}</>;
  return <span className="term" tabIndex={0} data-tip={tip}>{children}</span>;
}
