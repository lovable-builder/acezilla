"use client";
import { useRef } from "react";
import { switchWorkspace } from "@/app/actions";

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: { id: string; name: string }[]; currentId: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={switchWorkspace} className="ws-switch">
      <label className="eyebrow" htmlFor="ws">Workspace</label>
      <select id="ws" name="workspace" defaultValue={currentId} onChange={() => form.current?.requestSubmit()} className="field" style={{ padding: "8px 10px" }}>
        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </form>
  );
}
