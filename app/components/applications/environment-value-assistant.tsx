import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
	generateEnvironmentValue,
	hashEnvironmentValue,
	inferEnvironmentValueKind,
	type EnvironmentValueKind,
} from '@root/app/utils/environmentValueGenerator';

interface ConfigurationValue {
	label: string;
	secret?: boolean;
	value: string;
}

interface Props {
	configurationValues: ConfigurationValue[];
	framework?: string;
	onApply: (value: string, secret: boolean) => void;
	variable?: { isSecret: boolean; key: string; value: string };
}

const controlClass = 'rounded-xl border border-brand-primary/15 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';

/** Provides one field-aware value generator for the selected environment variable. */
export function EnvironmentValueAssistant({ configurationValues, framework, onApply, variable }: Props) {
	const [kind, setKind] = useState<EnvironmentValueKind>(() => inferEnvironmentValueKind(variable?.key ?? ''));
	const [length, setLength] = useState(32);
	const [booleanValue, setBooleanValue] = useState(true);
	const [configurationLabel, setConfigurationLabel] = useState(configurationValues[0]?.label ?? '');
	const [hashAlgorithm, setHashAlgorithm] = useState<'SHA-256' | 'SHA-512'>('SHA-256');
	const [hashSource, setHashSource] = useState('');
	const [preview, setPreview] = useState('');
	const [working, setWorking] = useState(false);

	async function generate(): Promise<void> {
		setWorking(true);
		try {
			if (kind === 'configuration') {
				setPreview(configurationValues.find(({ label }) => label === configurationLabel)?.value ?? '');
				return;
			}
			if (kind === 'hash') {
				if (!hashSource) {
					toast.error('Enter source text to hash.');
					return;
				}
				setPreview(await hashEnvironmentValue(hashSource, hashAlgorithm));
				return;
			}
			setPreview(generateEnvironmentValue({ booleanValue, framework, kind, length }));
		} finally {
			setWorking(false);
		}
	}

	function apply(): void {
		if (!preview) return;
		if (variable?.value && variable.value !== preview && !window.confirm(`Replace the current value for ${variable.key || 'this variable'}?`)) return;
		const configurationSecret = kind === 'configuration' && configurationValues.find(({ label }) => label === configurationLabel)?.secret === true;
		onApply(preview, variable?.isSecret === true || configurationSecret || ['password', 'secret', 'framework'].includes(kind));
		toast.success(`Value applied to ${variable?.key || 'the selected variable'}.`);
	}

	if (!variable) return <section className="rounded-2xl border border-dashed border-brand-primary/20 p-5 text-sm text-app-muted">Select an environment variable on the left to generate or insert its value.</section>;

	return (
		<section className="rounded-2xl border border-brand-action/25 bg-app-surface p-4 sm:p-5">
			<div className="flex items-start gap-3"><span className="rounded-xl bg-brand-action/15 p-2"><Sparkles className="size-4" /></span><div><h4 className="font-black">Value assistant</h4><p className="mt-1 break-all font-mono text-xs text-app-muted">Target: {variable.key || 'Unnamed variable'}</p></div></div>
		<div className="mt-4 grid gap-3">
			<label className="grid gap-1.5 text-xs font-bold">Value type<select className={controlClass} onChange={(event) => { setKind(event.target.value as EnvironmentValueKind); setPreview(''); }} value={kind}><option value="boolean">True / false</option><option value="password">Password</option><option value="secret">Random secret</option><option value="framework">Framework secret</option><option value="uuid">UUID</option><option value="hex">Hex string</option><option value="base64url">Base64URL string</option><option value="integer">Integer</option><option value="configuration">Application configuration</option><option value="hash">One-way hash</option></select></label>
			{kind === 'boolean' && <label className="grid gap-1.5 text-xs font-bold">Value<select className={controlClass} onChange={(event) => setBooleanValue(event.target.value === 'true')} value={String(booleanValue)}><option value="true">true</option><option value="false">false</option></select></label>}
			{['password', 'secret', 'framework', 'hex', 'base64url'].includes(kind) && <label className="grid gap-1.5 text-xs font-bold">Length<input className={controlClass} max={256} min={8} onChange={(event) => setLength(Number(event.target.value))} type="number" value={length} /></label>}
			{kind === 'configuration' && <label className="grid gap-1.5 text-xs font-bold">Configuration value<select className={controlClass} onChange={(event) => { setConfigurationLabel(event.target.value); setPreview(''); }} value={configurationLabel}>{configurationValues.map(({ label, value }) => <option disabled={!value || /Assigned|Completed|Not set|Not selected|Generated after/.test(value)} key={label} value={label}>{label}</option>)}</select></label>}
			{kind === 'hash' && <><label className="grid gap-1.5 text-xs font-bold">Algorithm<select className={controlClass} onChange={(event) => setHashAlgorithm(event.target.value as typeof hashAlgorithm)} value={hashAlgorithm}><option value="SHA-256">SHA-256</option><option value="SHA-512">SHA-512</option></select></label><label className="grid gap-1.5 text-xs font-bold">Source text<textarea className={`${controlClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => setHashSource(event.target.value)} placeholder="Text to hash" value={hashSource} /></label><p className="text-xs leading-5 text-amber-700 dark:text-amber-300">Hashes are one-way checksums. Do not hash passwords or tokens when the application needs their original value.</p></>}
			<button className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2.5 text-sm font-bold disabled:opacity-50" disabled={working} onClick={() => void generate()} type="button"><RefreshCw className={`size-4 ${working ? 'animate-spin' : ''}`} /> Generate preview</button>
			{preview && <div className="rounded-xl bg-app-canvas p-3"><div className="flex items-start justify-between gap-3"><code className="min-w-0 break-all text-xs leading-5">{preview}</code><button aria-label="Copy generated value" className="shrink-0 rounded-lg border border-brand-primary/15 p-2" onClick={() => void navigator.clipboard.writeText(preview).then(() => toast.success('Generated value copied.')).catch(() => toast.error('Unable to copy generated value.'))} type="button"><Copy className="size-3.5" /></button></div></div>}
			<button className="rounded-xl bg-brand-action px-4 py-2.5 text-sm font-black text-brand-ink disabled:opacity-50" disabled={!preview} onClick={apply} type="button">Apply to {variable.key || 'Variable'}</button>
		</div>
	</section>
	);
}
