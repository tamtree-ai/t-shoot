"use client";

import { useState, useTransition } from "react";

import {
  deleteCharacterAction,
  inviteAction,
  mintTokenAction,
  notifyPrefsAction,
  saveCharacterAction,
  slackAction,
  voiceConsentAction,
} from "@/app/horizon-actions";
import { stickCatalog } from "@/lib/stick/registry";
import type { SavedCharacter } from "@/services/cast";

export function WorkspacePanel({
  role,
  slack,
  characters,
  consent,
  prefs,
}: {
  role: "owner" | "editor" | "client";
  slack: string;
  characters: SavedCharacter[];
  consent: boolean;
  prefs: { notifyComment: boolean; notifyApproved: boolean; notifyFilm: boolean; notifyLive: boolean; notifySlack: boolean };
}) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "client">("editor");
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [webhook, setWebhook] = useState(slack);
  const [flags, setFlags] = useState(prefs);
  const [name, setName] = useState("");
  const [body, setBody] = useState(stickCatalog.characters[0]?.id ?? "milo");
  const [color, setColor] = useState("#ff6a3d");
  const [hair, setHair] = useState("");
  const [accessory, setAccessory] = useState("");
  const [personality, setPersonality] = useState("");
  const [tokenName, setTokenName] = useState("Assistant");
  const [cap, setCap] = useState("1.00");
  const [config, setConfig] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-10">
      {role === "owner" && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-rule bg-panel p-6">
          <h2 className="text-[17px] font-semibold">Invite</h2>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Invite email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" className="h-9 flex-1 rounded-lg border border-line bg-canvas px-2" />
            <select aria-label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "client")} className="h-9 rounded-lg border border-line bg-canvas px-2">
              <option value="editor">Editor</option>
              <option value="client">Client</option>
            </select>
            <button type="button" className="h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink" onClick={() => startTransition(async () => {
              const result = await inviteAction(email, inviteRole);
              if (!result.ok) setNote(result.error);
              else { setNote("Invite sent."); setLink(result.devLink ?? null); }
            })}>Invite</button>
          </div>
          <p className="text-[12px] text-fg-muted">Clients can review and approve. They don’t see cost or settings.</p>
          {link && <a href={link} className="text-[13px] text-accent-link break-all">{link}</a>}
        </section>
      )}

      {role !== "client" && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-rule bg-panel p-6">
          <h2 className="text-[17px] font-semibold">Notifications</h2>
          {([
            ["notifyComment", "A client commented"],
            ["notifyApproved", "A client approved"],
            ["notifyFilm", "A film is ready"],
            ["notifyLive", "A post went live"],
            ["notifySlack", "Also send these to Slack"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={flags[key]} onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          <button type="button" className="h-9 w-fit rounded-lg border border-line px-3 text-[13px]" onClick={() => startTransition(async () => { const result = await notifyPrefsAction(flags); setNote(result.ok ? "Saved." : result.error); })}>Save notifications</button>
          {role === "owner" && (
            <label className="flex flex-col gap-1 text-[13px]">Slack webhook
              <input aria-label="Slack webhook" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.slack.com/…" className="h-9 rounded-lg border border-line bg-canvas px-2" />
              <button type="button" className="h-9 w-fit text-accent-link" onClick={() => startTransition(async () => { const result = await slackAction(webhook); setNote(result.ok ? "Slack saved." : result.error); })}>Save Slack</button>
            </label>
          )}
        </section>
      )}

      {role !== "client" && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-rule bg-panel p-6">
          <h2 className="text-[17px] font-semibold">Your cast</h2>
          <p className="text-[12px] text-fg-muted">Start from a catalog body. The picture stays that body until the stage can take a colour and an accessory. The personality line goes to the writer.</p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {characters.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>{c.name} · {c.body}{c.personality ? ` · ${c.personality}` : ""}</span>
                <button type="button" className="text-fg-3" onClick={() => startTransition(async () => { await deleteCharacterAction(c.id); })}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Character name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 rounded-lg border border-line bg-canvas px-2" />
            <select aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} className="h-9 rounded-lg border border-line bg-canvas px-2">
              {stickCatalog.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input aria-label="Colour" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 rounded-lg border border-line bg-canvas px-2" />
            <input aria-label="Hair or hat" value={hair} onChange={(e) => setHair(e.target.value)} placeholder="Hair or hat" className="h-9 rounded-lg border border-line bg-canvas px-2" />
            <input aria-label="Accessory" value={accessory} onChange={(e) => setAccessory(e.target.value)} placeholder="One accessory" className="h-9 rounded-lg border border-line bg-canvas px-2" />
            <input aria-label="Personality" value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="dry, always right, hates meetings" className="h-9 rounded-lg border border-line bg-canvas px-2" />
          </div>
          <button type="button" disabled={pending} className="h-9 w-fit rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink" onClick={() => startTransition(async () => {
            const result = await saveCharacterAction({ name, body, color, hair, accessory, personality });
            setNote(result.ok ? "Character saved." : result.error);
          })}>Save character</button>
        </section>
      )}

      {role === "owner" && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-rule bg-panel p-6">
          <h2 className="text-[17px] font-semibold">Your voice</h2>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={consent} onChange={(e) => startTransition(async () => { const result = await voiceConsentAction(e.target.checked); setNote(result.ok ? "Consent saved. Cloning isn’t available yet." : result.error); })} />
            I consent to a clone of my voice. This only records consent. Cloning isn’t available yet.
          </label>
        </section>
      )}

      {role !== "client" && (
        <section className="flex flex-col gap-3 rounded-[14px] border border-rule bg-panel p-6">
          <h2 className="text-[17px] font-semibold">Connect an assistant</h2>
          <p className="text-[12px] text-fg-muted">The assistant can draft. Approve, posting, and anything over the daily cap stay a click in t-shoot.</p>
          <div className="flex gap-2">
            <input aria-label="Token name" value={tokenName} onChange={(e) => setTokenName(e.target.value)} className="h-9 rounded-lg border border-line bg-canvas px-2" />
            <input aria-label="Daily cap in dollars" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 w-24 rounded-lg border border-line bg-canvas px-2" />
            <button type="button" className="h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-ink" onClick={() => startTransition(async () => {
              const result = await mintTokenAction(tokenName, cap);
              if (!result.ok) setNote(result.error);
              else setConfig(result.config);
            })}>Create token</button>
          </div>
          {config && <textarea readOnly aria-label="MCP config" value={config} rows={8} className="rounded-lg border border-line bg-canvas p-2 font-mono text-[12px]" />}
        </section>
      )}
      {note && <p className="text-[13px] text-fg-2">{note}</p>}
    </div>
  );
}
