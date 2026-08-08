import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, Clock3, Code2, HardDriveUpload, LockKeyhole, Save, ShieldAlert } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { updateApplicationSettingsSchema, type UpdateApplicationSettingsRequest } from '@schemas/applicationSettings';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface SettingsResponse {
	customPagesAllowed: boolean;
	effectiveSiteState: { comingSoonActive: boolean; maintenanceActive: boolean };
	framework: string | null;
	settings: UpdateApplicationSettingsRequest;
}

interface ApiBody<T> { data?: T; message: string; status: boolean }

const fieldClass = 'mt-2 w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 outline-none focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

function localDateTime(value: string | null): string {
	if (!value) return '';
	const date = new Date(value);
	const offset = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function expiry(value: string): string | null {
	return value ? new Date(value).toISOString() : null;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
	return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-brand-primary/10 p-4"><span className="font-bold">{label}</span><input checked={checked} className="size-5 accent-brand-action" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}

/** Release, error, upload, and site-state controls. Page design is deliberately package-gated and deferred. */
export function ApplicationSettingsForm({ applicationId, operationalStatus, workspaceId }: { applicationId: string; operationalStatus: string; workspaceId: number }) {
	const [detail, setDetail] = useState<SettingsResponse>();
	const endpoint = `/api/v1/workspaces/${workspaceId}/applications/${applicationId}/settings`;
	const form = useForm<UpdateApplicationSettingsRequest>({ resolver: zodResolver(updateApplicationSettingsSchema) });

	useEffect(() => {
		void api<SettingsResponse>(endpoint).then((result) => {
			setDetail(result);
			form.reset(result.settings);
		}).catch((error) => toast.error(error instanceof Error ? error.message : 'Application settings are unavailable.'));
	}, [endpoint, form]);

	async function submit(values: UpdateApplicationSettingsRequest): Promise<void> {
		try {
			const result = await api<{ effectiveSiteState: SettingsResponse['effectiveSiteState']; settings: UpdateApplicationSettingsRequest }>(endpoint, {
				body: JSON.stringify(values),
				headers: { 'content-type': 'application/json' },
				method: 'POST',
			});
			form.reset(result.settings);
			setDetail((current) => current ? { ...current, effectiveSiteState: result.effectiveSiteState, settings: result.settings } : current);
			toast.success('Application settings saved.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Application settings could not be saved.');
		}
	}

	if (!detail) return <div className="grid min-h-52 place-items-center text-sm font-semibold text-app-muted">Loading application settings…</div>;

	return <form className="grid gap-6" onSubmit={form.handleSubmit(submit)}>
		{operationalStatus === 'suspended' && <div className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-200"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><strong>Application suspended</strong><p className="mt-1 text-sm">Platform suspension has priority over maintenance and coming-soon settings. Only an authorised administrator can remove it.</p></div></div>}
		<section className="rounded-2xl border border-brand-primary/10 p-5">
			<h3 className="flex items-center gap-2 text-xl font-black"><Code2 className="size-5" />Deployment automation</h3>
			<p className="mt-2 text-sm text-app-muted">Release commands run inside the newly deployed application. A failed migration or seeder marks the deployment as failed.</p>
			<div className="mt-5 grid gap-4 lg:grid-cols-2">
				<Controller control={form.control} name="migrateOnDeploy" render={({ field }) => <Toggle checked={field.value} label="Migrate on deploy" onChange={field.onChange} />} />
				<Controller control={form.control} name="runSeederOnDeploy" render={({ field }) => <Toggle checked={field.value} label="Run seeder on deploy" onChange={field.onChange} />} />
				<label className="text-sm font-semibold">Migration command<Controller control={form.control} name="migrationCommand" render={({ field }) => <input className={fieldClass} onChange={(event) => field.onChange(event.target.value || null)} placeholder="No migration command detected" value={field.value ?? ''} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Framework preset detected for {detail.framework ?? 'this stack'}. Change only when the project uses a different migration tool.</span>{form.formState.errors.migrationCommand && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.migrationCommand.message}</span>}</label>
				<label className="text-sm font-semibold">Migration timeout<Controller control={form.control} name="migrationTimeoutSeconds" render={({ field }) => <input className={fieldClass} max="3600" min="30" onChange={(event) => field.onChange(Number(event.target.value))} type="number" value={field.value} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Maximum seconds allowed before Ghost Deploy stops the migration.</span></label>
				<label className="text-sm font-semibold">Seeder command<Controller control={form.control} name="seederCommand" render={({ field }) => <input className={fieldClass} onChange={(event) => field.onChange(event.target.value || null)} placeholder="No seeder command selected" value={field.value ?? ''} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Seeders default to off because production seeders may not be repeatable.</span>{form.formState.errors.seederCommand && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.seederCommand.message}</span>}</label>
				<label className="text-sm font-semibold">Seeder timeout<Controller control={form.control} name="seederTimeoutSeconds" render={({ field }) => <input className={fieldClass} max="3600" min="30" onChange={(event) => field.onChange(Number(event.target.value))} type="number" value={field.value} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Maximum seconds allowed for the optional seeder.</span></label>
				<Controller control={form.control} name="maintenanceDuringDeployment" render={({ field }) => <Toggle checked={field.value} label="Maintenance during deployment" onChange={field.onChange} />} />
			</div>
		</section>

		<section className="rounded-2xl border border-brand-primary/10 p-5">
			<h3 className="flex items-center gap-2 text-xl font-black"><Clock3 className="size-5" />Site state</h3>
			<p className="mt-2 text-sm text-app-muted">These preferences are ready for the managed-page serving layer. Custom page design will be added separately and depends on the workspace package.</p>
			<div className="mt-5 grid gap-4 lg:grid-cols-2">
				<Controller control={form.control} name="maintenanceEnabled" render={({ field }) => <Toggle checked={field.value} label="Maintenance mode" onChange={field.onChange} />} />
				<label className="text-sm font-semibold">Maintenance auto-expiry<Controller control={form.control} name="maintenanceExpiresAt" render={({ field }) => <input className={fieldClass} min={localDateTime(new Date().toISOString())} onChange={(event) => field.onChange(expiry(event.target.value))} type="datetime-local" value={localDateTime(field.value)} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Leave empty to keep maintenance enabled until manually disabled.</span></label>
				<Controller control={form.control} name="comingSoonEnabled" render={({ field }) => <Toggle checked={field.value} label="Coming soon mode" onChange={field.onChange} />} />
				<label className="text-sm font-semibold">Coming-soon auto-expiry<Controller control={form.control} name="comingSoonExpiresAt" render={({ field }) => <input className={fieldClass} min={localDateTime(new Date().toISOString())} onChange={(event) => field.onChange(expiry(event.target.value))} type="datetime-local" value={localDateTime(field.value)} />} /><span className="mt-1 block text-xs font-normal text-app-muted">The application becomes visible automatically after this time.</span></label>
			</div>
			<div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-1 ${detail.effectiveSiteState.maintenanceActive ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-gray-500/10 text-app-muted'}`}>Maintenance {detail.effectiveSiteState.maintenanceActive ? 'active' : 'inactive'}</span><span className={`rounded-full px-3 py-1 ${detail.effectiveSiteState.comingSoonActive ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-gray-500/10 text-app-muted'}`}>Coming soon {detail.effectiveSiteState.comingSoonActive ? 'active' : 'inactive'}</span></div>
		</section>

		<section className="rounded-2xl border border-brand-primary/10 p-5">
			<h3 className="flex items-center gap-2 text-xl font-black"><AlertTriangle className="size-5" />Error responses</h3>
			<div className="mt-5 grid gap-4 lg:grid-cols-2"><Controller control={form.control} name="returnErrors" render={({ field }) => <Toggle checked={field.value} label="Return application errors" onChange={field.onChange} />} /><label className="text-sm font-semibold">Public error detail<Controller control={form.control} name="publicErrorMode" render={({ field }) => <select className={fieldClass} {...field}><option value="generic">Generic page only</option><option value="message">Safe error message</option><option value="detailed">Detailed error</option></select>} /><span className="mt-1 block text-xs font-normal text-app-muted">Secrets and platform internals are removed in every mode. Detailed errors may reveal application structure.</span></label></div>
		</section>

		<section className="rounded-2xl border border-brand-primary/10 p-5">
			<h3 className="flex items-center gap-2 text-xl font-black"><HardDriveUpload className="size-5" />Uploads</h3>
			<div className="mt-5 grid gap-4 lg:grid-cols-3">
				{([['uploadMaxFileSizeMb', 'Maximum file size', 'MB allowed for one uploaded file.'], ['uploadMaxRequestSizeMb', 'Maximum request size', 'MB allowed for the complete request.'], ['uploadTimeoutSeconds', 'Upload timeout', 'Seconds before an incomplete upload is stopped.']] as const).map(([name, label, hint]) => <label className="text-sm font-semibold" key={name}>{label}<Controller control={form.control} name={name} render={({ field }) => <input className={fieldClass} min="1" onChange={(event) => field.onChange(Number(event.target.value))} type="number" value={field.value} />} /><span className="mt-1 block text-xs font-normal text-app-muted">{hint}</span></label>)}
				<label className="text-sm font-semibold lg:col-span-3">Allowed extensions<Controller control={form.control} name="uploadAllowedExtensions" render={({ field }) => <input className={fieldClass} onChange={(event) => field.onChange(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="jpg, png, pdf — empty allows all" value={field.value.join(', ')} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Comma-separated extensions without filenames.</span></label>
				<label className="text-sm font-semibold lg:col-span-3">Allowed MIME types<Controller control={form.control} name="uploadAllowedMimeTypes" render={({ field }) => <input className={fieldClass} onChange={(event) => field.onChange(event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} placeholder="image/jpeg, image/png — empty allows all" value={field.value.join(', ')} />} /><span className="mt-1 block text-xs font-normal text-app-muted">Both extension and MIME restrictions apply when configured.</span></label>
			</div>
		</section>

		<section className={`rounded-2xl border p-5 ${detail.customPagesAllowed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-brand-primary/10 bg-brand-primary/5'}`}><h3 className="flex items-center gap-2 text-lg font-black">{detail.customPagesAllowed ? <CheckCircle2 className="size-5 text-emerald-600" /> : <LockKeyhole className="size-5" />}Custom system pages</h3><p className="mt-2 text-sm text-app-muted">{detail.customPagesAllowed ? 'Included in this workspace package. The page editor will be enabled in the later customization phase.' : 'Maintenance, coming-soon, suspended, and error page customization is locked by this workspace package. Standard Ghost Deploy pages remain available.'}</p></section>

		<div className="sticky bottom-0 flex justify-end border-t border-brand-primary/10 bg-app-surface/95 py-4 backdrop-blur"><button className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-black text-brand-ink disabled:opacity-50" disabled={form.formState.isSubmitting} type="submit"><Save className="size-4" />{form.formState.isSubmitting ? 'Saving…' : 'Save settings'}</button></div>
	</form>;
}
