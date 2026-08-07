import { RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
	bestEnvironmentConfigurationLabel,
	generateEnvironmentValue,
	hashEnvironmentValue,
	inferEnvironmentValueKind,
	type EnvironmentConfigurationValue,
	type EnvironmentValueKind,
} from '@root/app/utils/environmentValueGenerator';

interface Props {
	configurationValues: EnvironmentConfigurationValue[];
	framework?: string;
	onApply: (value: string, secret: boolean) => void;
	variable?: { isSecret: boolean; key: string; value: string };
}

const controlClass = 'rounded-xl border border-brand-primary/15 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';
const unavailableConfiguration = /Assigned|Completed|Not set|Not selected|Generated after/;

/** Provides direct field-aware value generation for the selected environment variable. */
export function EnvironmentValueAssistant({ configurationValues, framework, onApply, variable }: Props) {
	const [kind, setKind] = useState<EnvironmentValueKind>(() => inferEnvironmentValueKind(variable?.key ?? ''));
	const [length, setLength] = useState(32);
	const [configurationLabel, setConfigurationLabel] = useState(() => bestEnvironmentConfigurationLabel(variable?.key ?? '', configurationValues));
	const [hashAlgorithm, setHashAlgorithm] = useState<'SHA-256' | 'SHA-512'>('SHA-256');
	const [hashSource, setHashSource] = useState('');
	const [working, setWorking] = useState(false);

	function applyValue(value: string, secret: boolean): void {
		if (!value) {
			toast.error('The selected value is not available yet.');
			return;
		}
		if (variable?.value && variable.value !== value && !window.confirm(`Replace the current value for ${variable.key || 'this variable'}?`)) return;
		onApply(value, variable?.isSecret === true || secret);
		toast.success(`Value applied to ${variable?.key || 'the selected variable'}.`);
	}

	async function generateAndApply(): Promise<void> {
		setWorking(true);
		try {
			if (kind === 'configuration') {
				const selected = configurationValues.find(({ label }) => label === configurationLabel);
				applyValue(selected?.value ?? '', selected?.secret === true);
				return;
			}
			if (kind === 'hash') {
				if (!hashSource) {
					toast.error('Enter source text to hash.');
					return;
				}
				applyValue(await hashEnvironmentValue(hashSource, hashAlgorithm), false);
				return;
			}
			applyValue(generateEnvironmentValue({ framework, kind, length }), ['password', 'secret', 'framework'].includes(kind));
		} finally {
			setWorking(false);
		}
	}

	if (!variable) return <section className="rounded-2xl border border-dashed border-brand-primary/20 p-5 text-sm text-app-muted">Select an environment variable on the left to generate or insert its value.</section>;
	const selectedConfiguration = configurationValues.find(({ label }) => label === configurationLabel);
	const configurationAvailable = Boolean(selectedConfiguration?.value && !unavailableConfiguration.test(selectedConfiguration.value));

	return (
		<section className="rounded-2xl border border-brand-action/25 bg-app-surface p-4 sm:p-5">
			<div className="flex items-start gap-3"><span className="rounded-xl bg-brand-action/15 p-2"><Sparkles className="size-4" /></span><div><h4 className="font-black">Value assistant</h4><p className="mt-1 break-all font-mono text-xs text-app-muted">Target: {variable.key || 'Unnamed variable'}</p></div></div>
			<div className="mt-4 grid gap-3">
				<label className="grid gap-1.5 text-xs font-bold">Value type<select className={controlClass} onChange={(event) => { const next = event.target.value as EnvironmentValueKind; setKind(next); if (next === 'configuration') setConfigurationLabel(bestEnvironmentConfigurationLabel(variable.key, configurationValues)); }} value={kind}><option value="boolean">True / false</option><option value="password">Password</option><option value="secret">Random secret</option><option value="framework">Framework secret</option><option value="uuid">UUID</option><option value="hex">Hex string</option><option value="base64url">Base64URL string</option><option value="integer">Integer</option><option value="configuration">Application configuration</option><option value="hash">One-way hash</option></select></label>
				{kind === 'boolean' && <div className="grid grid-cols-2 gap-2"><button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-black transition hover:border-brand-action hover:bg-brand-action/10" onClick={() => applyValue('true', false)} type="button">True</button><button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-black transition hover:border-brand-action hover:bg-brand-action/10" onClick={() => applyValue('false', false)} type="button">False</button></div>}
				{['password', 'secret', 'framework', 'hex', 'base64url'].includes(kind) && <label className="grid gap-1.5 text-xs font-bold">Length<input className={controlClass} max={256} min={8} onChange={(event) => setLength(Number(event.target.value))} type="number" value={length} /></label>}
				{kind === 'configuration' && <label className="grid gap-1.5 text-xs font-bold">Configuration value<select className={controlClass} onChange={(event) => setConfigurationLabel(event.target.value)} value={configurationLabel}><option value="">Choose a configuration value</option>{configurationValues.map(({ label, value }) => <option disabled={!value || unavailableConfiguration.test(value)} key={label} value={label}>{label}</option>)}</select>{configurationLabel && !configurationAvailable && <span className="font-normal text-amber-700 dark:text-amber-300">This value becomes available after the related application field is configured.</span>}</label>}
				{kind === 'hash' && <><label className="grid gap-1.5 text-xs font-bold">Algorithm<select className={controlClass} onChange={(event) => setHashAlgorithm(event.target.value as typeof hashAlgorithm)} value={hashAlgorithm}><option value="SHA-256">SHA-256</option><option value="SHA-512">SHA-512</option></select></label><label className="grid gap-1.5 text-xs font-bold">Source text<textarea className={`${controlClass} min-h-24 resize-y font-mono text-xs`} onChange={(event) => setHashSource(event.target.value)} placeholder="Text to hash" value={hashSource} /></label><p className="text-xs leading-5 text-amber-700 dark:text-amber-300">Hashes are one-way checksums. Do not hash credentials when the application needs their original value.</p></>}
				{kind !== 'boolean' && <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-3 text-sm font-black text-brand-ink disabled:opacity-50" disabled={working || (kind === 'configuration' && !configurationAvailable) || (kind === 'hash' && !hashSource)} onClick={() => void generateAndApply()} type="button"><RefreshCw className={`size-4 ${working ? 'animate-spin' : ''}`} />{kind === 'configuration' ? 'Apply selected value' : kind === 'hash' ? 'Hash & apply' : 'Generate & apply'}</button>}
			</div>
		</section>
	);
}
