import { zodResolver } from "@hookform/resolvers/zod";
import { Globe2, KeyRound, LoaderCircle, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";
import {
  updatePlatformSettingsSchema,
  type UpdatePlatformSettingsInput,
} from "@schemas/platformSettings";

interface StoredSettings extends UpdatePlatformSettingsInput {
  applicationDomainStatus: string;
  panelDomainStatus: string;
}
const inputClass =
  "rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100";

export default function PlatformSettingsPage() {
  const [statuses, setStatuses] = useState({
    applicationDomainStatus: "pending",
    panelDomainStatus: "pending",
  });
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<UpdatePlatformSettingsInput>({
    resolver: zodResolver(updatePlatformSettingsSchema),
    defaultValues: {
      applicationBaseDomain: "",
      defaultApplicationSubdomainEnabled: true,
      dnsProvider: "cloudflare",
      domainOwnershipVerificationEnabled: true,
	  reservedDomainLabels: ['admin', 'api', 'dashboard', 'panel', 'www'],
	  blockedDomainKeywords: [],
      ingressIpv4: null,
      ingressIpv6: null,
      panelBaseUrl: null,
      panelDomainMode: "same_domain",
      publicBaseUrl: "",
    },
  });
  const panelMode = useWatch({ control, name: "panelDomainMode" });
  const applicationBaseDomain = useWatch({
    control,
    name: "applicationBaseDomain",
  });
  useEffect(() => {
    void authenticatedFetch("/api/v1/operations/platform-settings")
      .then((response) => response.json())
      .then((body: { data?: StoredSettings; status: boolean }) => {
        if (!body.status || !body.data) return;
        reset({
          applicationBaseDomain: body.data.applicationBaseDomain,
          defaultApplicationSubdomainEnabled:
            body.data.defaultApplicationSubdomainEnabled,
          dnsProvider: body.data.dnsProvider,
          domainOwnershipVerificationEnabled:
            body.data.domainOwnershipVerificationEnabled,
		  reservedDomainLabels: body.data.reservedDomainLabels,
		  blockedDomainKeywords: body.data.blockedDomainKeywords,
          ingressIpv4: body.data.ingressIpv4,
          ingressIpv6: body.data.ingressIpv6,
          panelBaseUrl: body.data.panelBaseUrl,
          panelDomainMode: body.data.panelDomainMode,
          publicBaseUrl: body.data.publicBaseUrl,
        });
        setStatuses(body.data);
      });
  }, [reset]);
  const submit = handleSubmit(async (input) => {
    const response = await authenticatedFetch(
      "/api/v1/operations/platform-settings",
      {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as {
      data?: StoredSettings;
      message: string;
      status: boolean;
    };
    if (!response.ok || !body.status) {
      toast.error(body.message);
      return;
    }
    if (body.data) setStatuses(body.data);
    toast.success(body.message);
  });
  async function verify(target: "applications" | "panel"): Promise<void> {
    const response = await authenticatedFetch(
      "/api/v1/operations/platform-settings/verify",
      {
        body: JSON.stringify({ target }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    const body = (await response.json()) as {
      message: string;
      status: boolean;
    };
    if (!response.ok || !body.status) {
      toast.error(body.message);
      return;
    }
    setStatuses((current) => ({
      ...current,
      [target === "panel" ? "panelDomainStatus" : "applicationDomainStatus"]:
        "verified",
    }));
    toast.success(body.message);
  }
  return (
    <main className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
        Platform settings
      </p>
      <h2 className="mt-2 text-4xl font-black">Domains and routing</h2>
      <p className="mt-3 max-w-3xl text-app-muted">
        Choose where the website, authenticated panel, and customer applications
        are served. Saving a hostname does not create DNS records or
        certificates.
      </p>
      <form
        className="mt-8 grid gap-6 rounded-3xl border border-brand-primary/10 bg-app-surface p-6 sm:p-8"
        onSubmit={submit}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Public website URL
          <input
            className={inputClass}
            placeholder="https://abc.com"
            {...register("publicBaseUrl")}
          />
          {errors.publicBaseUrl && (
            <span className="text-xs text-rose-500">
              {errors.publicBaseUrl.message}
            </span>
          )}
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">Panel location</legend>
          <Controller
            control={control}
            name="panelDomainMode"
            render={({ field }) => (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "same_domain",
                    "Same domain",
                    "Use abc.com/dashboard and abc.com/admin.",
                  ],
                  [
                    "separate_domain",
                    "Separate domain",
                    "Use a dedicated verified panel hostname.",
                  ],
                ].map(([value, title, description]) => (
                  <label
                    className={`cursor-pointer rounded-2xl border p-4 ${field.value === value ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                    key={value}
                  >
                    <input
                      checked={field.value === value}
                      className="sr-only"
                      name={field.name}
                      onChange={() => field.onChange(value)}
                      type="radio"
                    />
                    <span className="font-bold">{title}</span>
                    <span className="mt-1 block text-sm font-normal text-app-muted">
                      {description}
                    </span>
                  </label>
                ))}
              </div>
            )}
          />
        </fieldset>
        {panelMode === "separate_domain" && (
          <label className="grid gap-2 text-sm font-semibold">
            Panel URL
            <input
              className={inputClass}
              placeholder="https://panel.abc.com"
              {...register("panelBaseUrl")}
            />
            {errors.panelBaseUrl && (
              <span className="text-xs text-rose-500">
                {errors.panelBaseUrl.message}
              </span>
            )}
            <span className="flex items-center gap-2 text-xs font-normal text-app-muted">
              <ShieldCheck className="size-4" /> Status:{" "}
              {statuses.panelDomainStatus}. Same-domain routing remains active
              until verification.
            </span>
            {statuses.panelDomainStatus !== "verified" && (
              <button
                className="w-fit rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
                onClick={() => void verify("panel")}
                type="button"
              >
                Verify panel DNS and HTTPS
              </button>
            )}
          </label>
        )}
        <label className="grid gap-2 text-sm font-semibold">
          Default application domain
          <input
            className={inputClass}
            placeholder="apps.abc.com"
            {...register("applicationBaseDomain")}
          />
          {errors.applicationBaseDomain && (
            <span className="text-xs text-rose-500">
              {errors.applicationBaseDomain.message}
            </span>
          )}
          <span className="flex items-center gap-2 text-xs font-normal text-app-muted">
            <Globe2 className="size-4" /> Applications use &lt;slug&gt;.
            {applicationBaseDomain || "apps.abc.com"} · Status:{" "}
            {statuses.applicationDomainStatus}
          </span>
          {statuses.applicationDomainStatus !== "verified" && (
            <button
              className="w-fit rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
              onClick={() => void verify("applications")}
              type="button"
            >
              Verify wildcard DNS and HTTPS
            </button>
          )}
        </label>
        <fieldset className="grid gap-4 rounded-2xl border border-brand-primary/10 p-4 sm:grid-cols-2">
          <legend className="px-2 text-sm font-semibold">
            Managed DNS ingress
          </legend>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Authoritative DNS provider
            <select className={inputClass} {...register("dnsProvider")}>
              <option value="powerdns">Self-hosted PowerDNS</option>
              <option value="cloudflare">Cloudflare</option>
            </select>
            <span className="text-xs font-normal text-app-muted">New managed zones use this provider. Existing zones stay with their original provider.</span>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Ingress IPv4
            <input
              className={inputClass}
              placeholder="203.0.113.10"
              {...register("ingressIpv4")}
            />
            <span className="text-xs font-normal text-app-muted">
              Used for managed A records.
            </span>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Ingress IPv6{" "}
            <span className="font-normal text-app-muted">Optional</span>
            <input
              className={inputClass}
              placeholder="2001:db8::10"
              {...register("ingressIpv6")}
            />
            <span className="text-xs font-normal text-app-muted">
              Used for managed AAAA records.
            </span>
          </label>
        </fieldset>
        <label className="flex items-start gap-3 rounded-2xl border border-brand-primary/10 p-4">
          <input
            className="mt-1"
            type="checkbox"
            {...register("defaultApplicationSubdomainEnabled")}
          />
          <span>
            <span className="block font-bold">
              Enable a platform subdomain by default
            </span>
            <span className="mt-1 block text-sm text-app-muted">
              Customers can retain it alongside a custom domain or disable it
              after custom-domain verification.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-brand-primary/10 p-4">
          <input
            className="mt-1"
            type="checkbox"
            {...register("domainOwnershipVerificationEnabled")}
          />
          <span>
            <span className="block font-bold">
              Require custom-domain ownership verification
            </span>
            <span className="mt-1 block text-sm text-app-muted">
              Require DNS TXT proof for new ownership claims. Existing ownership
              boundaries and cross-workspace approvals remain enforced when
              disabled.
            </span>
          </span>
        </label>
		<fieldset className="grid gap-4 rounded-2xl border border-brand-primary/10 p-4 sm:grid-cols-2">
		  <legend className="px-2 text-sm font-semibold">Default-domain label policy</legend>
		  <Controller control={control} name="reservedDomainLabels" render={({ field }) => <label className="grid gap-2 text-sm font-semibold">Reserved labels<textarea className={`${inputClass} min-h-28`} onChange={(event) => field.onChange(event.target.value.split(/[\n,]/).map((value) => value.trim().toLowerCase()).filter(Boolean))} value={field.value.join('\n')} /><span className="text-xs font-normal text-app-muted">One label per line. Exact matches such as admin, api, or www cannot be used for application default domains.</span></label>} />
		  <Controller control={control} name="blockedDomainKeywords" render={({ field }) => <label className="grid gap-2 text-sm font-semibold">Blocked keywords<textarea className={`${inputClass} min-h-28`} onChange={(event) => field.onChange(event.target.value.split(/[\n,]/).map((value) => value.trim().toLowerCase()).filter(Boolean))} value={field.value.join('\n')} /><span className="text-xs font-normal text-app-muted">One keyword per line. A readable application label containing one of these terms is rejected.</span></label>} />
		</fieldset>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}{" "}
          Save platform settings
        </button>
      </form>
      <DnsProviderSettings />
    </main>
  );
}

type ProviderCode = 'cloudflare' | 'powerdns' | 'godaddy' | 'hostinger';
interface ProviderConnection {
  accountIdentifier: string | null;
  lastError: string | null;
  lastValidatedAt: string | null;
  provider: ProviderCode;
  status: string;
  tokenSuffix: string;
}

const PROVIDERS: Array<{ code: ProviderCode; name: string; tokenLabel: string }> = [
  { code: 'cloudflare', name: 'Cloudflare', tokenLabel: 'API token' },
  { code: 'powerdns', name: 'PowerDNS', tokenLabel: 'API key' },
  { code: 'godaddy', name: 'GoDaddy', tokenLabel: 'Personal access token' },
  { code: 'hostinger', name: 'Hostinger', tokenLabel: 'API token' },
];

/** Manages encrypted platform-owned DNS provider credentials without exposing secrets. */
function DnsProviderSettings() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [working, setWorking] = useState<ProviderCode | null>(null);

  async function load(): Promise<void> {
    const response = await authenticatedFetch('/api/v1/operations/platform-settings/dns-providers');
    const body = await response.json() as { data?: ProviderConnection[]; message: string; status: boolean };
    if (response.ok && body.status) setConnections(body.data ?? []);
    else toast.error(body.message);
  }

  useEffect(() => {
    void authenticatedFetch('/api/v1/operations/platform-settings/dns-providers')
      .then((response) => response.json())
      .then((body: { data?: ProviderConnection[]; message: string; status: boolean }) => {
        if (body.status) setConnections(body.data ?? []);
        else toast.error(body.message);
      });
  }, []);

  async function mutate(provider: ProviderCode, method: 'DELETE' | 'POST', path = '', input?: Record<string, string>): Promise<void> {
    setWorking(provider);
    try {
      const response = await authenticatedFetch(`/api/v1/operations/platform-settings/dns-providers/${provider}${path}`, {
        method,
        ...(input ? { body: JSON.stringify(input), headers: { 'content-type': 'application/json' } } : {}),
      });
      const body = await response.json() as { message: string; status: boolean };
      if (!response.ok || !body.status) { toast.error(body.message); return; }
      toast.success(body.message);
      await load();
    } finally { setWorking(null); }
  }

  return <section className="mt-8 rounded-3xl border border-brand-primary/10 bg-app-surface p-6 sm:p-8">
    <div className="flex items-start gap-3"><KeyRound className="mt-1 size-5 text-brand-primary dark:text-brand-action" /><div><h3 className="text-xl font-black">DNS provider connections</h3><p className="mt-1 text-sm text-app-muted">Encrypted platform credentials are used when a customer does not supply a one-time token. Tokens are never displayed after saving.</p></div></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">{PROVIDERS.map((provider) => {
      const connection = connections.find((item) => item.provider === provider.code);
      return <form className="grid content-start gap-4 rounded-2xl border border-brand-primary/10 p-5" key={provider.code} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const token = String(data.get('token') ?? '').trim(); const accountIdentifier = String(data.get('accountIdentifier') ?? '').trim(); void mutate(provider.code, 'POST', '', { ...(token ? { token } : {}), ...(['cloudflare', 'powerdns'].includes(provider.code) ? { accountIdentifier } : {}) }); }}>
        <div><h4 className="font-black">{provider.name}</h4><p className="mt-1 text-xs text-app-muted">{connection ? `Status: ${connection.status} · Token ending ${connection.tokenSuffix}` : 'Not configured'}</p></div>
        {provider.code === 'cloudflare' && <label className="grid gap-2 text-sm font-semibold">Account ID<input className={inputClass} defaultValue={connection?.accountIdentifier ?? ''} name="accountIdentifier" placeholder="Cloudflare account ID" required /></label>}
        {provider.code === 'powerdns' && <label className="grid gap-2 text-sm font-semibold">API URL<input className={inputClass} defaultValue={connection?.accountIdentifier ?? ''} name="accountIdentifier" placeholder="http://172.31.33.141:8081" required type="url" /></label>}
        <label className="grid gap-2 text-sm font-semibold">{provider.tokenLabel}<input autoComplete="new-password" className={inputClass} name="token" placeholder={connection ? 'Leave blank to retain current token' : provider.tokenLabel} required={!connection} type="password" /></label>
        {connection?.lastValidatedAt && <p className="text-xs text-app-muted">Last validated: {new Date(connection.lastValidatedAt).toLocaleString()}</p>}
        {connection?.lastError && <p className="text-xs text-rose-500">{connection.lastError}</p>}
        <button className="rounded-xl bg-brand-action px-4 py-2 font-bold text-brand-ink disabled:opacity-60" disabled={working === provider.code}>{working === provider.code ? 'Working…' : connection ? 'Save / rotate' : 'Save connection'}</button>
        {connection && <div className="grid grid-cols-2 gap-2"><button className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" disabled={working === provider.code} onClick={() => void mutate(provider.code, 'POST', '/validate')} type="button"><RefreshCw className="size-4" /> Validate</button><button className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm font-bold text-rose-500" disabled={working === provider.code} onClick={() => void mutate(provider.code, 'DELETE')} type="button"><Trash2 className="size-4" /> Remove</button></div>}
      </form>;
    })}</div>
  </section>;
}
