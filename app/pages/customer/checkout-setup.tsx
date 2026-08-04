import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Building2, LoaderCircle, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type UseFormRegister,
} from "react-hook-form";
import { useNavigate, useParams } from "react-router";

import { SearchableSelect } from "@root/app/components/forms/searchable-select";
import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";
import {
  configureCheckoutWorkspaceSchema,
  type ConfigureCheckoutWorkspaceInput,
} from "@schemas/checkout";

/** Collects the immutable billing identity captured with the purchase. */
function BillingProfileFields({
  register,
}: {
  register: UseFormRegister<ConfigureCheckoutWorkspaceInput>;
}) {
  const inputClass =
    "mt-2 w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100";
  return (
    <fieldset className="mt-8 grid gap-4 rounded-2xl border border-brand-primary/10 p-5 sm:grid-cols-2">
      <legend className="px-2 font-bold">Billing profile</legend>
      <label>
        <span className="text-sm font-semibold">Billing name</span>
        <input
          className={inputClass}
          {...register("billingProfile.displayName")}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">Billing email</span>
        <input
          className={inputClass}
          type="email"
          {...register("billingProfile.contactEmail")}
        />
      </label>
      <label className="sm:col-span-2">
        <span className="text-sm font-semibold">Address</span>
        <input
          className={inputClass}
          {...register("billingProfile.addressLine1")}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">City</span>
        <input className={inputClass} {...register("billingProfile.city")} />
      </label>
      <label>
        <span className="text-sm font-semibold">State / region</span>
        <input className={inputClass} {...register("billingProfile.region")} />
      </label>
      <label>
        <span className="text-sm font-semibold">Postal code</span>
        <input
          className={inputClass}
          {...register("billingProfile.postalCode")}
        />
      </label>
      <label>
        <span className="text-sm font-semibold">Country code</span>
        <input
          className={`${inputClass} uppercase`}
          maxLength={2}
          {...register("billingProfile.countryCode")}
        />
      </label>
    </fieldset>
  );
}

export default function CheckoutSetupPage() {
  const { checkoutId } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<{
    packageName: string;
    status: string;
  }>();
  const [error, setError] = useState("");
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<ConfigureCheckoutWorkspaceInput>({
    resolver: zodResolver(configureCheckoutWorkspaceSchema),
    defaultValues: {
      name: "",
      type: "personal",
      organisation: null,
      billingProfile: {
        displayName: "",
        contactEmail: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        region: "",
        postalCode: "",
        countryCode: "IN",
      },
    },
  });
  const type = useWatch({ control, name: "type" });
  useEffect(() => {
    void authenticatedFetch(`/api/v1/checkouts/${checkoutId}`)
      .then(async (response) => {
        const body = (await response.json()) as {
          data?: { packageName: string; status: string };
          message: string;
          status: boolean;
        };
        if (!response.ok || !body.status || !body.data)
          throw new Error(body.message);
        setPurchase(body.data);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the purchase.",
        ),
      );
  }, [checkoutId]);
  const submit = handleSubmit(async (input) => {
    setError("");
    const response = await authenticatedFetch(
      `/api/v1/checkouts/${checkoutId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const body = (await response.json()) as {
      data?: { dashboardUrl?: string };
      message: string;
      status: boolean;
    };
    if (!response.ok || !body.status || !body.data?.dashboardUrl) {
      setError(body.message);
      return;
    }
    const authUser = JSON.parse(
      sessionStorage.getItem("authUser") ?? "{}",
    ) as Record<string, unknown>;
    sessionStorage.setItem(
      "authUser",
      JSON.stringify({ ...authUser, hasCustomerDashboardAccess: true }),
    );
    navigate(body.data.dashboardUrl);
  });
  if (!purchase && !error)
    return (
      <main className="grid min-h-screen place-items-center bg-app-canvas">
        <LoaderCircle className="size-7 animate-spin text-brand-primary dark:text-brand-action" />
      </main>
    );
  return (
    <main className="min-h-screen bg-app-canvas px-5 py-10 text-app-text sm:px-8">
      <form
        className="mx-auto max-w-3xl rounded-[2rem] border border-brand-primary/10 bg-app-surface p-6 sm:p-10"
        onSubmit={submit}
      >
        <p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
          Purchase complete · {purchase?.packageName}
        </p>
        <h1 className="mt-2 text-4xl font-black">Configure your workspace</h1>
        <p className="mt-4 text-app-muted">
          This workspace will own the plan, billing history, entitlements, and
          hosting resources.
        </p>
        {error && (
          <p className="mt-6 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">
            {error}
          </p>
        )}
        <label className="mt-8 block">
          <span className="font-semibold">Workspace name</span>
          <input
            className="mt-2 w-full rounded-2xl border border-brand-primary/15 bg-app-canvas px-4 py-3 outline-none focus:border-brand-action"
            {...register("name")}
            placeholder="My production workspace"
          />
          {errors.name && (
            <span className="mt-1 block text-xs text-rose-500">
              {errors.name.message}
            </span>
          )}
        </label>
        <div className="mt-6">
          <span className="font-semibold">Workspace type</span>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <SearchableSelect
                className="mt-2"
                onChange={(value) => field.onChange(value)}
                options={[
                  {
                    label: "Personal",
                    value: "personal",
                    keywords: "individual",
                  },
                  {
                    label: "Organisation",
                    value: "organisation",
                    keywords: "business company",
                  },
                ]}
                renderOption={(option) => (
                  <span className="flex items-center gap-2">
                    {option.value === "personal" ? (
                      <UserRound className="size-4" />
                    ) : (
                      <Building2 className="size-4" />
                    )}
                    {option.label}
                  </span>
                )}
                searchable={false}
                value={field.value}
              />
            )}
          />
        </div>
        {type === "organisation" && (
          <div className="mt-6 grid gap-4 rounded-2xl border border-brand-primary/10 p-5">
            <label>
              <span className="font-semibold">Organisation display name</span>
              <input
                className="mt-2 w-full rounded-xl border border-brand-primary/15 bg-app-canvas px-4 py-3"
                {...register("organisation.displayName")}
              />
            </label>
            <label>
              <span className="font-semibold">
                Legal name <span className="text-app-muted">(optional)</span>
              </span>
              <input
                className="mt-2 w-full rounded-xl border border-brand-primary/15 bg-app-canvas px-4 py-3"
                {...register("organisation.legalName")}
              />
            </label>
          </div>
        )}
        <BillingProfileFields register={register} />
        <button
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-action px-5 py-4 font-bold text-brand-ink disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              Create workspace <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </main>
  );
}
