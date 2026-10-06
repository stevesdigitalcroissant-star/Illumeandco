"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { personalityAction, widgetAction } from "./actions";

const LANGUAGES = [
  ["en", "English"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["ur", "Urdu"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["de", "German"],
  ["ru", "Russian"],
  ["tl", "Tagalog"],
  ["zh", "Chinese"],
] as const;

type Agent = {
  name: string;
  tone: string;
  formality: number;
  warmth: number;
  emojiUsage: string;
  greeting: string | null;
  languages: string[];
  brandPersonality: string | null;
  customInstructions: string | null;
};

export function PersonalityForm({ agent }: { agent: Agent }) {
  const [formality, setFormality] = useState(agent.formality);
  const [warmth, setWarmth] = useState(agent.warmth);
  return (
    <ActionForm action={personalityAction} className="space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="How the receptionist introduces itself.">
          <Input name="name" defaultValue={agent.name} required maxLength={40} />
        </Field>
        <Field label="Tone">
          <NativeSelect name="tone" defaultValue={agent.tone}>
            {["friendly", "professional", "warm", "calm", "upbeat", "luxurious"].map((t) => (
              <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Formality — ${formality < 34 ? "casual" : formality < 67 ? "balanced" : "formal"}`}>
          <input type="range" name="formality" min={0} max={100} value={formality} onChange={(e) => setFormality(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </Field>
        <Field label={`Friendly ↔ professional — ${warmth < 34 ? "to the point" : warmth < 67 ? "friendly" : "very warm"}`}>
          <input type="range" name="warmth" min={0} max={100} value={warmth} onChange={(e) => setWarmth(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Emoji usage">
          <NativeSelect name="emojiUsage" defaultValue={agent.emojiUsage}>
            <option value="none">None</option>
            <option value="light">Occasional</option>
            <option value="frequent">Frequent</option>
          </NativeSelect>
        </Field>
        <Field label="Greeting" hint="First message in the website chat. Leave empty for the default.">
          <Input name="greeting" defaultValue={agent.greeting ?? ""} maxLength={300} placeholder="Hi! Welcome — how can I help today?" />
        </Field>
      </div>
      <Field label="Languages" hint="The AI replies in the customer's language when it's one of these; otherwise in the first one.">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(([code, label]) => (
            <label key={code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
              <input type="checkbox" name="languages" value={code} defaultChecked={agent.languages.includes(code)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Brand personality" hint="A sentence or two about how your brand sounds.">
        <Textarea name="brandPersonality" defaultValue={agent.brandPersonality ?? ""} rows={2} maxLength={2000} placeholder="Calm, reassuring and premium — like a five-star hotel concierge." />
      </Field>
      <Field label="Extra instructions" hint="Business-specific guidance. Safety rules always take priority over these.">
        <Textarea name="customInstructions" defaultValue={agent.customInstructions ?? ""} rows={3} maxLength={2000} placeholder="Always mention that new patients get a free check-up with whitening." />
      </Field>
      <SubmitButton>Save personality</SubmitButton>
    </ActionForm>
  );
}

type Widget = { title: string; accentColor: string; position: "left" | "right"; logoUrl: string | null; greeting: string | null };

export function WidgetForm({ widget }: { widget: Widget }) {
  const [color, setColor] = useState(widget.accentColor);
  return (
    <ActionForm action={widgetAction} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" defaultValue={widget.title} required maxLength={60} />
        </Field>
        <Field label="Position">
          <NativeSelect name="position" defaultValue={widget.position}>
            <option value="right">Bottom right</option>
            <option value="left">Bottom left</option>
          </NativeSelect>
        </Field>
        <Field label="Accent colour">
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1" aria-label="Pick colour" />
            <Input name="accentColor" value={color} onChange={(e) => setColor(e.target.value)} pattern="#[0-9a-fA-F]{6}" />
          </div>
        </Field>
        <Field label="Logo URL" hint="Optional, must be https.">
          <Input name="logoUrl" type="url" defaultValue={widget.logoUrl ?? ""} placeholder="https://…/logo.png" />
        </Field>
      </div>
      <Field label="Widget greeting" hint="Overrides the receptionist greeting in the website chat.">
        <Input name="greeting" defaultValue={widget.greeting ?? ""} maxLength={300} />
      </Field>
      <SubmitButton>Save widget</SubmitButton>
    </ActionForm>
  );
}
