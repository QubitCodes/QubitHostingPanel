import {
  ArrowRightLeft,
  Building2,
  LoaderCircle,
  ReceiptText,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import type { WorkspaceSummary } from "@root/app/layouts/customer";
import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";

interface BillingProfile {
  id: string;
  version: number;
  displayName: string;
  contactEmail: string;
  city: string;
  countryCode: string;
  createdAt: string;
}
interface IncomingTransfer {
  id: string;
  workspaceName: string;
  workspacePublicId: number;
  status: string;
  expiresAt: string;
}

/** Customer-owned workspace identity, billing-version, transfer, and cancellation controls. */
export default function WorkspaceSettingsPage() {
  const { active } = useOutletContext<{ active?: WorkspaceSummary }>();
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [transfers, setTransfers] = useState<IncomingTransfer[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const workspaceId = active?.publicId;
  async function api(path: string, init?: RequestInit) {
    const response = await authenticatedFetch(path, init);
    const body = (await response.json()) as {
      data?: unknown;
      message: string;
      status: boolean;
    };
    if (!response.ok || !body.status) throw new Error(body.message);
    setMessage(body.message);
    return body.data;
  }
  async function refresh() {
    if (!workspaceId) return;
    const [billing, incoming] = await Promise.all([
      api(`/api/v1/workspaces/${workspaceId}/billing-profiles`),
      api("/api/v1/ownership-transfers"),
    ]);
    setProfiles((billing ?? []) as BillingProfile[]);
    setTransfers((incoming ?? []) as IncomingTransfer[]);
  }
  useEffect(() => {
    if (!workspaceId) return;
    void Promise.all([
      authenticatedFetch(`/api/v1/workspaces/${workspaceId}/billing-profiles`),
      authenticatedFetch("/api/v1/ownership-transfers"),
    ])
      .then(async ([billingResponse, transferResponse]) => {
        const billing = (await billingResponse.json()) as {
          data?: BillingProfile[];
          message: string;
          status: boolean;
        };
        const incoming = (await transferResponse.json()) as {
          data?: IncomingTransfer[];
          message: string;
          status: boolean;
        };
        if (!billingResponse.ok || !billing.status)
          throw new Error(billing.message);
        if (!transferResponse.ok || !incoming.status)
          throw new Error(incoming.message);
        setProfiles(billing.data ?? []);
        setTransfers(incoming.data ?? []);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load workspace settings.",
        ),
      );
  }, [workspaceId]);
  async function submit(path: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].filter(
        ([, value]) => String(value).trim() !== "",
      ),
    );
    try {
      await api(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function convert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await submit(`/api/v1/workspaces/${workspaceId}/convert`, event);
    void values;
  }
  async function respond(id: string, decision: "accept" | "decline") {
    setBusy(true);
    try {
      await api(`/api/v1/ownership-transfers/${id}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Response failed.");
    } finally {
      setBusy(false);
    }
  }
  async function setCancellation(cancelAtPeriodEnd: boolean) {
    setBusy(true);
    try {
      await api(`/api/v1/workspaces/${workspaceId}/subscription/cancellation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd, reason: cancelAtPeriodEnd ? "Requested by workspace owner." : undefined }),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancellation update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!active)
    return (
      <div className="grid min-h-56 place-items-center">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  const input =
    "mt-2 w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100";
  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
        Workspace settings
      </p>
      <h2 className="mt-2 text-4xl font-black">{active.name}</h2>
      {message && (
        <p className="mt-5 rounded-xl bg-brand-primary/10 p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {active.type === "personal" && (
          <form
            className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6"
            onSubmit={(event) => void convert(event)}
          >
            <Building2 className="size-6 text-brand-primary dark:text-brand-action" />
            <h3 className="mt-4 text-xl font-black">Convert to organisation</h3>
            <p className="mt-2 text-sm text-app-muted">
              Workspace identity, subscription, and resources stay unchanged.
            </p>
            <label className="mt-5 block text-sm font-semibold">
              Display name
              <input className={input} name="displayName" required />
            </label>
            <label className="mt-4 block text-sm font-semibold">
              Legal name
              <input className={input} name="legalName" />
            </label>
            <button
              className="mt-5 rounded-xl bg-brand-action px-4 py-3 font-bold text-brand-ink"
              disabled={busy}
            >
              Convert workspace
            </button>
          </form>
        )}
        <form
          className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6"
          onSubmit={(event) =>
            void submit(
              `/api/v1/workspaces/${workspaceId}/ownership-transfer`,
              event,
            )
          }
        >
          <ArrowRightLeft className="size-6 text-brand-primary dark:text-brand-action" />
          <h3 className="mt-4 text-xl font-black">Transfer ownership</h3>
          <p className="mt-2 text-sm text-app-muted">
            Recipient must confirm. A replacement workspace is created for you
            when required.
          </p>
          <label className="mt-5 block text-sm font-semibold">
            Recipient user ID
            <input
              className={input}
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="recipientUserPublicId"
              required
            />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Reason
            <input className={input} name="reason" />
          </label>
          <button
            className="mt-5 rounded-xl bg-brand-action px-4 py-3 font-bold text-brand-ink"
            disabled={busy}
          >
            Request transfer
          </button>
        </form>
        <form
          className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 lg:col-span-2"
          onSubmit={(event) =>
            void submit(
              `/api/v1/workspaces/${workspaceId}/billing-profiles`,
              event,
            )
          }
        >
          <ReceiptText className="size-6 text-brand-primary dark:text-brand-action" />
          <h3 className="mt-4 text-xl font-black">
            New billing profile version
          </h3>
          <p className="mt-2 text-sm text-app-muted">
            Existing versions remain immutable for historical invoices and
            purchases.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Display name
              <input className={input} name="displayName" required />
            </label>
            <label className="text-sm font-semibold">
              Email
              <input
                className={input}
                name="contactEmail"
                required
                type="email"
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Address
              <input className={input} name="addressLine1" required />
            </label>
            <label className="text-sm font-semibold">
              City
              <input className={input} name="city" required />
            </label>
            <label className="text-sm font-semibold">
              State / region
              <input className={input} name="region" required />
            </label>
            <label className="text-sm font-semibold">
              Postal code
              <input className={input} name="postalCode" required />
            </label>
            <label className="text-sm font-semibold">
              Country code
              <input
                className={input}
                defaultValue="IN"
                maxLength={2}
                name="countryCode"
                required
              />
            </label>
          </div>
          <button
            className="mt-5 rounded-xl bg-brand-action px-4 py-3 font-bold text-brand-ink"
            disabled={busy}
          >
            Create immutable version
          </button>
          <div className="mt-6 grid gap-2">
            {profiles.map((profile) => (
              <div
                className="flex flex-wrap justify-between gap-3 rounded-xl border border-brand-primary/10 p-4 text-sm"
                key={profile.id}
              >
                <span>
                  <strong>
                    v{profile.version} · {profile.displayName}
                  </strong>
                  <br />
                  <span className="text-app-muted">
                    {profile.contactEmail} · {profile.city},{" "}
                    {profile.countryCode}
                  </span>
                </span>
                <span className="text-app-muted">
                  {new Date(profile.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </form>
        {active.subscriptionStatus && (
          <section className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 lg:col-span-2">
            <h3 className="text-xl font-black">Subscription cancellation</h3>
            <p className="mt-2 text-sm text-app-muted">Keep service active through the paid term, or reverse a scheduled cancellation before it ends.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-xl border border-rose-500/30 px-4 py-3 font-bold text-rose-600 dark:text-rose-300" disabled={busy || active.cancelAtPeriodEnd === true} onClick={() => void setCancellation(true)}>Cancel at term end</button>
              <button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" disabled={busy || active.cancelAtPeriodEnd !== true} onClick={() => void setCancellation(false)}>Keep subscription</button>
            </div>
          </section>
        )}
        {transfers.length > 0 && (
          <section className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 lg:col-span-2">
            <h3 className="text-xl font-black">Incoming ownership transfers</h3>
            <div className="mt-5 grid gap-3">
              {transfers.map((transfer) => (
                <article
                  className="flex flex-col justify-between gap-4 rounded-xl border border-brand-primary/10 p-4 sm:flex-row sm:items-center"
                  key={transfer.id}
                >
                  <div>
                    <strong>{transfer.workspaceName}</strong>
                    <p className="text-sm text-app-muted">
                      Expires {new Date(transfer.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  {transfer.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-brand-primary/15 px-3 py-2 font-bold"
                        disabled={busy}
                        onClick={() => void respond(transfer.id, "decline")}
                      >
                        Decline
                      </button>
                      <button
                        className="rounded-lg bg-brand-action px-3 py-2 font-bold text-brand-ink"
                        disabled={busy}
                        onClick={() => void respond(transfer.id, "accept")}
                      >
                        Accept
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
