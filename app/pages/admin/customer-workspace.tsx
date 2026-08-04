import { LoaderCircle, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";

interface Item {
  id: string;
  code: string;
  nameSnapshot: string;
  quantity: number;
  unitAmountMinor: number;
  currency: string;
  status: string;
}
interface Detail {
  workspaceName: string;
  workspaceType: string;
  ownerName: string | null;
  ownerMobile: string | null;
  packageName: string | null;
  subscriptionStatus: string | null;
  termEndsAt: string | null;
  items: Item[];
}

/** Focused administrator lifecycle and immutable add-on management workspace. */
export default function CustomerWorkspacePage() {
  const { workspaceId } = useParams();
  const [detail, setDetail] = useState<Detail>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
    setDetail(
      (await api(
        `/api/v1/operations/customer-workspaces/${workspaceId}`,
      )) as Detail,
    );
  }
  useEffect(() => {
    void authenticatedFetch(
      `/api/v1/operations/customer-workspaces/${workspaceId}`,
    )
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: Detail;
          message: string;
          status: boolean;
        };
        if (!response.ok || !body.status || !body.data)
          throw new Error(body.message);
        setDetail(body.data);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load workspace.",
        ),
      );
  }, [workspaceId]);
  async function lifecycle(status: string) {
    setBusy(true);
    try {
      await api(
        `/api/v1/operations/customer-workspaces/${workspaceId}/subscription`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            reason: `Administrator changed lifecycle to ${status}.`,
          }),
        },
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  async function addOn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const payload = {
      code: raw.code,
      name: raw.name,
      quantity: Number(raw.quantity),
      unitAmountMinor: Math.round(Number(raw.unitAmount) * 100),
      currency: raw.currency,
      entitlementSnapshot: [],
    };
    try {
      await api(
        `/api/v1/operations/customer-workspaces/${workspaceId}/add-ons`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      form.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Add-on failed.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel(item: Item) {
    setBusy(true);
    try {
      await api(
        `/api/v1/operations/customer-workspaces/${workspaceId}/add-ons/${item.id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "Cancelled by administrator." }),
        },
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Cancellation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!detail)
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  const input =
    "mt-2 w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100";
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-brand-primary dark:text-brand-action" to="/admin/customers">Back to customers</Link>
        <Link className="rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold" to={`/admin/customers/${workspaceId}/usage`}>Usage and overrides</Link>
      </div>
      <h1 className="mt-3 text-4xl font-black">{detail.workspaceName}</h1>
      <p className="mt-3 text-app-muted">
        {detail.ownerName ?? "Unassigned"} · {detail.ownerMobile ?? "No mobile"}{" "}
        · {detail.packageName ?? "No plan"}
      </p>
      {message && (
        <p className="mt-5 rounded-xl bg-brand-primary/10 p-3 text-sm">
          {message}
        </p>
      )}
      <article className="mt-8 rounded-3xl border border-brand-primary/10 bg-app-surface p-6">
        <h2 className="text-xl font-black">Primary subscription</h2>
        <p className="mt-2 capitalize text-app-muted">
          {detail.subscriptionStatus ?? "None"} · term ends{" "}
          {detail.termEndsAt
            ? new Date(detail.termEndsAt).toLocaleDateString()
            : "—"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {["trialing", "active", "cancelled", "expired"].map((status) => (
            <button
              className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold capitalize disabled:opacity-50"
              disabled={busy || detail.subscriptionStatus === status}
              key={status}
              onClick={() => void lifecycle(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </article>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form
          className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6"
          onSubmit={(event) => void addOn(event)}
        >
          <Plus className="size-5" />
          <h2 className="mt-4 text-xl font-black">Add subscription item</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Code
              <input className={input} name="code" required />
            </label>
            <label className="text-sm font-semibold">
              Name
              <input className={input} name="name" required />
            </label>
            <label className="text-sm font-semibold">
              Quantity
              <input
                className={input}
                min="1"
                name="quantity"
                required
                type="number"
              />
            </label>
            <label className="text-sm font-semibold">
              Unit price
              <input
                className={input}
                min="0"
                name="unitAmount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className="text-sm font-semibold">
              Currency
              <input
                className={input}
                defaultValue="INR"
                maxLength={3}
                name="currency"
                required
              />
            </label>
          </div>
          <button
            className="mt-5 rounded-xl bg-brand-action px-4 py-3 font-bold text-brand-ink"
            disabled={busy}
          >
            Add item
          </button>
        </form>
        <section className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6">
          <h2 className="text-xl font-black">Add-ons</h2>
          <div className="mt-5 grid gap-3">
            {detail.items.map((item) => (
              <article
                className="rounded-xl border border-brand-primary/10 p-4"
                key={item.id}
              >
                <div className="flex justify-between gap-4">
                  <span>
                    <strong>{item.nameSnapshot}</strong>
                    <br />
                    <span className="text-sm text-app-muted">
                      {item.code} · {item.quantity} ×{" "}
                      {(item.unitAmountMinor / 100).toLocaleString("en-IN")}{" "}
                      {item.currency}
                    </span>
                  </span>
                  <span className="text-sm capitalize">{item.status}</span>
                </div>
                {item.status === "active" && (
                  <button
                    className="mt-3 text-sm font-bold text-rose-600 dark:text-rose-300"
                    disabled={busy}
                    onClick={() => void cancel(item)}
                  >
                    Cancel add-on
                  </button>
                )}
              </article>
            ))}
            {!detail.items.length && (
              <p className="text-sm text-app-muted">No add-ons.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
