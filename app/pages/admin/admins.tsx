import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus, Search, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";

import { Offcanvas } from "@root/app/components/ui/offcanvas";
import { PhoneNumberInput } from "@root/app/components/forms/phone-number-input";
import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";
import { createAdminSchema } from "@schemas/admin";

interface AdminSummary {
  createdAt: string;
  displayName?: string | null;
  hasPermissionOverrides: boolean;
  id: string;
  publicId: number;
  mobileE164: string;
  mobileVerifiedAt?: string | null;
  roles: Array<{ id: string; name: string }>;
  status: "active" | "inactive" | "suspended";
}
interface RoleOption {
  code: string;
  description?: string | null;
  id: string;
  name: string;
  permissionIds: string[];
}
interface PermissionOption {
  code: string;
  id: string;
  name: string;
}
interface AdminDetail extends AdminSummary {
  auditLogs: Array<{
    action: string;
    createdAt: string;
    id: string;
    ipAddress?: string | null;
    metadata: Record<string, unknown>;
    reason?: string | null;
    resourceType: string;
    userAgent?: string | null;
  }>;
  overrides: Array<{ effect: "allow" | "deny"; permissionId: string }>;
  roles: RoleOption[];
}
interface ApiEnvelope<T> {
  data: T;
  message: string;
  status: boolean;
}
type CreateAdminForm = z.infer<typeof createAdminSchema>;
type Tab = "audit-logs" | "basic" | "roles" | "permissions";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.status) throw new Error(body.message);
  return body.data;
}

function effectivePermissionIds(
  inherited: Set<string>,
  overrides: AdminDetail["overrides"],
): Set<string> {
  const result = new Set(inherited);
  overrides.forEach(({ effect, permissionId }) =>
    effect === "allow" ? result.add(permissionId) : result.delete(permissionId),
  );
  return result;
}

function normalizedTab(value?: string): Tab {
  return value === "roles" || value === "permissions" || value === "audit-logs"
    ? value
    : "basic";
}

/** Full-width URL-driven administrator create, view, and update workspace. */
export default function AdminsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { adminId, section } = useParams();
  const creating = location.pathname.includes("/create");
  const editing = location.pathname.includes("/edit/");
  const activeTab = normalizedTab(section);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [detail, setDetail] = useState<AdminDetail>();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(),
  );
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [permissionNote, setPermissionNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const draft = useMemo(() => {
    if (typeof sessionStorage === "undefined") return undefined;
    try {
      return JSON.parse(
        sessionStorage.getItem("adminCreateDraft") ?? "null",
      ) as Partial<CreateAdminForm> | undefined;
    } catch {
      return undefined;
    }
  }, []);
  const form = useForm<CreateAdminForm>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      countryCode: draft?.countryCode ?? "+91",
      displayName: draft?.displayName ?? "",
      mobile: draft?.mobile ?? "",
      roleIds: draft?.roleIds ?? [],
    },
  });
  const createCountryCode = useWatch({
    control: form.control,
    name: "countryCode",
  });
  const draftRoleIds = useMemo(() => draft?.roleIds ?? [], [draft]);

  const loadBase = useCallback(async () => {
    try {
      const [adminData, options] = await Promise.all([
        api<AdminSummary[]>("/api/v1/admins"),
        api<{ permissions: PermissionOption[]; roles: RoleOption[] }>(
          "/api/v1/admins/options",
        ),
      ]);
      setAdmins(adminData);
      setRoles(options.roles);
      setPermissions(options.permissions);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load administrators.",
      );
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadBase(), 0);
    return () => clearTimeout(timeout);
  }, [loadBase]);
  useEffect(() => {
    if (!adminId) return;
    const timeout = window.setTimeout(
      () =>
        void api<AdminDetail>(`/api/v1/admins/${adminId}`)
          .then((value) => {
            setDetail(value);
            const roleIds = value.roles.map(({ id }) => id);
            setSelectedRoles(roleIds);
            const inherited = new Set(
              roles
                .filter(({ id }) => roleIds.includes(id))
                .flatMap(({ permissionIds }) => permissionIds),
            );
            setSelectedPermissions(
              value.roles.some(({ code }) => code === "super_admin")
                ? new Set(permissions.map(({ id }) => id))
                : effectivePermissionIds(inherited, value.overrides),
            );
          })
          .catch((error) => toast.error(error.message)),
      0,
    );
    return () => clearTimeout(timeout);
  }, [adminId, permissions, roles]);
  useEffect(() => {
    if (!creating) return;
    const timeout = window.setTimeout(() => {
      setSelectedRoles(draftRoleIds);
      setSelectedPermissions(
        new Set(
          roles
            .filter(({ id }) => draftRoleIds.includes(id))
            .flatMap(({ permissionIds }) => permissionIds),
        ),
      );
    }, 0);
    return () => clearTimeout(timeout);
  }, [creating, draftRoleIds, roles]);

  const inheritedPermissions = useMemo(
    () =>
      new Set(
        roles
          .filter(({ id }) => selectedRoles.includes(id))
          .flatMap(({ permissionIds }) => permissionIds),
      ),
    [roles, selectedRoles],
  );
  const targetIsSuperAdmin =
    detail?.roles.some(({ code }) => code === "super_admin") ?? false;
  const filteredRoles = roles.filter((role) =>
    `${role.name} ${role.code} ${role.description ?? ""}`
      .toLowerCase()
      .includes(roleSearch.toLowerCase()),
  );
  const filteredPermissions = permissions.filter((permission) =>
    `${permission.name} ${permission.code}`
      .toLowerCase()
      .includes(permissionSearch.toLowerCase()),
  );
  const permissionModules = Object.entries(
    filteredPermissions.reduce<Record<string, PermissionOption[]>>(
      (modules, permission) => {
        const module = permission.code.split(".")[0] ?? "general";
        (modules[module] ??= []).push(permission);
        return modules;
      },
      {},
    ),
  );
  const basePath = creating
    ? "/admin/administrators/create"
    : editing
      ? `/admin/administrators/${adminId}/edit`
      : `/admin/administrators/${adminId}`;

  function go(tab: Tab): void {
    if (creating && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(
        "adminCreateDraft",
        JSON.stringify({ ...form.getValues(), roleIds: selectedRoles }),
      );
    }
    navigate(`${basePath}/${tab}`);
  }
  function close(): void {
    navigate("/admin/administrators");
    setDetail(undefined);
    if (typeof sessionStorage !== "undefined")
      sessionStorage.removeItem("adminCreateDraft");
  }
  function updateRoles(next: string[]): void {
    setSelectedRoles(next);
    form.setValue("roleIds", next, { shouldValidate: true });
    if (creating && typeof sessionStorage !== "undefined")
      sessionStorage.setItem(
        "adminCreateDraft",
        JSON.stringify({ ...form.getValues(), roleIds: next }),
      );
  }
  function updatePermissionSelection(ids: string[], selected: boolean): void {
    const next = new Set(selectedPermissions);
    ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
    setSelectedPermissions(next);
    setPermissionNote(
      "Permissions updated. Save changes or reset to role defaults.",
    );
  }
  function resetPermissions(): void {
    setSelectedPermissions(new Set(inheritedPermissions));
    setPermissionNote(
      "Permissions reset to the access inherited from selected roles.",
    );
  }
  function buildOverrides(): Array<{
    effect: "allow" | "deny";
    permissionId: string;
    reason: string;
  }> {
    return permissions.flatMap(({ id }) =>
      selectedPermissions.has(id) === inheritedPermissions.has(id)
        ? []
        : [
            {
              permissionId: id,
              effect: selectedPermissions.has(id)
                ? ("allow" as const)
                : ("deny" as const),
              reason: "Updated permission through administrator workspace",
            },
          ],
    );
  }

  async function saveRoles(): Promise<void> {
    if (!adminId) return;
    setBusy(true);
    try {
      await api(`/api/v1/admins/${adminId}/roles`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleIds: selectedRoles }),
      });
      toast.success("Roles updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update roles.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function savePermissions(): Promise<void> {
    if (!adminId) return;
    setBusy(true);
    try {
      await api(`/api/v1/admins/${adminId}/overrides`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrides: buildOverrides() }),
      });
      setPermissionNote(undefined);
      toast.success("Permissions updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update permissions.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createAdmin(values: CreateAdminForm): Promise<void> {
    setBusy(true);
    try {
      const created = await api<AdminSummary>("/api/v1/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, roleIds: selectedRoles }),
      });
      const overrides = buildOverrides();
      if (overrides.length)
        await api(`/api/v1/admins/${created.publicId}/overrides`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ overrides }),
        });
      if (typeof sessionStorage !== "undefined")
        sessionStorage.removeItem("adminCreateDraft");
      toast.success("Administrator created.");
      await loadBase();
      navigate(`/admin/administrators/${created.publicId}/basic`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create administrator.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function updateBasic(): Promise<void> {
    if (!adminId || !detail) return;
    setBusy(true);
    try {
      await api(`/api/v1/admins/${adminId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: detail.displayName,
          status: detail.status,
        }),
      });
      toast.success("Basic details updated.");
      await loadBase();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update administrator.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteAdmin(): Promise<void> {
    if (!adminId) return;
    const reason = window.prompt("Reason for deleting this administrator");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await api(`/api/v1/admins/${adminId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      toast.success("Administrator deleted.");
      close();
      await loadBase();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete administrator.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
            Platform access
          </p>
          <h2 className="mt-1 text-3xl font-bold">Administrators</h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Manage identities, roles, and effective permissions.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 text-sm font-semibold text-brand-ink"
          to="/admin/administrators/create/basic"
        >
          <Plus className="size-4" />
          Add administrator
        </Link>
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 bg-app-surface dark:border-stone-800">
        <table className="min-w-[56rem] w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500 dark:bg-stone-950/50">
            <tr>
              <th className="px-5 py-3">Name &amp; ID</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Roles</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {admins.map((admin) => (
              <tr key={admin.id}>
                <td className="px-5 py-4">
                  <p className="font-semibold">
                    {admin.displayName || "Unnamed administrator"}
                  </p>
                  <p className="text-xs font-medium text-stone-400">
                    {admin.publicId}
                  </p>
                </td>
                <td className="px-5 py-4 text-stone-600 dark:text-stone-300">
                  {admin.mobileE164}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {admin.roles.map((role) => (
                      <span
                        className="rounded-full bg-stone-100 px-2 py-1 text-xs font-medium dark:bg-stone-800"
                        key={role.id}
                      >
                        {role.name}
                      </span>
                    ))}
                    {admin.hasPermissionOverrides && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Modified permissions
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 capitalize">{admin.status}</td>
                <td className="px-5 py-4 text-right">
                  <Link
                    className="font-semibold text-brand-primary dark:text-brand-action"
                    to={`/admin/administrators/${admin.publicId}/basic`}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(creating || adminId) && (
        <Offcanvas
          onClose={close}
          title={
            creating
              ? "Add administrator"
              : detail?.displayName || "Administrator details"
          }
          width="full"
        >
          <div className="flex items-end gap-3 border-b border-stone-200 dark:border-stone-800">
            <nav className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex w-max gap-2">
                {(
                  [
                    "basic",
                    "roles",
                    "permissions",
                    ...(!creating && !editing ? (["audit-logs"] as Tab[]) : []),
                  ] as Tab[]
                ).map((tab) => (
                  <Link
                    className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold capitalize ${activeTab === tab ? "border-brand-action text-brand-primary dark:text-brand-action" : "border-transparent text-stone-500"}`}
                    key={tab}
                    to={`${basePath}/${tab}`}
                  >
                    {tab === "basic"
                      ? "Basic details"
                      : tab === "audit-logs"
                        ? "Audit logs"
                        : tab}
                  </Link>
                ))}
              </div>
            </nav>
            {adminId && !editing && (
              <Link
                className="mb-2.5 shrink-0 rounded-xl bg-brand-action px-4 py-2.5 text-sm font-semibold text-brand-ink"
                to={`/admin/administrators/${adminId}/edit/${activeTab === "audit-logs" ? "basic" : activeTab}`}
              >
                Edit admin
              </Link>
            )}
          </div>
          {activeTab === "basic" &&
            (creating || editing) &&
            (creating ? (
              <form
                className="mt-7 max-w-2xl space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  go("roles");
                }}
              >
                <Controller
                  control={form.control}
                  name="displayName"
                  render={({ field, fieldState }) => (
                    <label className="block text-sm font-medium">
                      Display name
                      <input
                        {...field}
                        className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
                      />
                      {fieldState.error && (
                        <span className="mt-1 block text-xs text-rose-600">
                          {fieldState.error.message}
                        </span>
                      )}
                    </label>
                  )}
                />
                <Controller
                  control={form.control}
                  name="mobile"
                  render={({ field, fieldState }) => (
                    <PhoneNumberInput
                      countryCode={createCountryCode}
                      error={fieldState.error?.message}
                      id="admin-mobile"
                      mobile={field.value}
                      onChange={(value) => {
                        form.setValue("countryCode", value.countryCode ?? "", {
                          shouldValidate: true,
                        });
                        field.onChange(value.mobile);
                      }}
                    />
                  )}
                />
                <button
                  className="rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink"
                  type="submit"
                >
                  Continue to roles
                </button>
              </form>
            ) : detail ? (
              <div className="mt-7 max-w-2xl space-y-5">
                <label className="block text-sm font-medium">
                  Display name
                  <input
                    className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
                    onChange={(event) =>
                      setDetail({ ...detail, displayName: event.target.value })
                    }
                    value={detail.displayName ?? ""}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Status
                  <select
                    className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
                    onChange={(event) =>
                      setDetail({
                        ...detail,
                        status: event.target.value as AdminSummary["status"],
                      })
                    }
                    value={detail.status}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <div className="flex gap-3">
                  <button
                    className="rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink"
                    disabled={busy}
                    onClick={() => void updateBasic()}
                  >
                    Save details
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-semibold text-white"
                    onClick={() => void deleteAdmin()}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-7 text-stone-500">Loading administrator…</p>
            ))}
          {activeTab === "basic" && !creating && !editing && detail && (
            <section className="mt-7 grid max-w-3xl gap-4 sm:grid-cols-2">
              {[
                ["Name", detail.displayName || "Unnamed administrator"],
                ["Public ID", String(detail.publicId)],
                ["Phone", detail.mobileE164],
                ["Status", detail.status],
              ].map(([label, value]) => (
                <div
                  className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800"
                  key={label}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {label}
                  </p>
                  <p className="mt-2 font-semibold capitalize">{value}</p>
                </div>
              ))}
            </section>
          )}
          {activeTab === "roles" && !creating && !editing && detail && (
            <section className="mt-7 flex flex-wrap gap-3">
              {detail.roles.map((role) => (
                <div
                  className="rounded-2xl border border-stone-200 px-4 py-3 dark:border-stone-800"
                  key={role.id}
                >
                  <p className="font-semibold">{role.name}</p>
                  <p className="text-sm text-stone-500">
                    {role.description || role.code}
                  </p>
                </div>
              ))}
            </section>
          )}
          {activeTab === "roles" && (creating || editing) && (
            <section className="mt-7">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative min-w-64 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <input
                    className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 dark:border-stone-700 dark:bg-stone-900"
                    onChange={(event) => setRoleSearch(event.target.value)}
                    placeholder="Search roles"
                    value={roleSearch}
                  />
                </label>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updateRoles([
                      ...new Set([
                        ...selectedRoles,
                        ...filteredRoles.map(({ id }) => id),
                      ]),
                    ])
                  }
                >
                  Select filtered
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updateRoles(
                      selectedRoles.filter(
                        (id) => !filteredRoles.some((role) => role.id === id),
                      ),
                    )
                  }
                >
                  Deselect filtered
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() => updateRoles(roles.map(({ id }) => id))}
                >
                  Select all
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() => updateRoles([])}
                >
                  Deselect all
                </button>
              </div>
              <p className="mt-4 text-sm text-stone-500">
                {selectedRoles.length} of {roles.length} roles selected
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredRoles.map((role) => (
                  <label
                    className="flex gap-3 rounded-2xl border border-stone-200 p-4 dark:border-stone-800"
                    key={role.id}
                  >
                    <input
                      checked={selectedRoles.includes(role.id)}
                      onChange={(event) =>
                        updateRoles(
                          event.target.checked
                            ? [...selectedRoles, role.id]
                            : selectedRoles.filter((id) => id !== role.id),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold">{role.name}</span>
                      <span className="text-sm text-stone-500">
                        {role.description || role.code}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="mt-6 rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-50"
                disabled={busy || selectedRoles.length === 0}
                onClick={() =>
                  creating ? go("permissions") : void saveRoles()
                }
              >
                {creating ? "Continue to permissions" : "Save roles"}
              </button>
            </section>
          )}
          {activeTab === "permissions" && !creating && !editing && detail && (
            <section className="mt-7 space-y-5">
              {targetIsSuperAdmin && (
                <div className="rounded-2xl border border-brand-muted/60 bg-brand-muted/15 p-4 text-sm text-brand-primary dark:border-brand-secondary dark:bg-brand-primary/30 dark:text-brand-muted">
                  Super Admin always has every permission. Individual permission
                  overrides are disabled.
                </div>
              )}
              {!targetIsSuperAdmin && detail.overrides.length > 0 && (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  Modified permissions
                </span>
              )}
              {permissionModules.map(([module, items]) => (
                <div
                  className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800"
                  key={module}
                >
                  <h3 className="font-semibold capitalize">{module}</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {items
                      .filter(({ id }) => selectedPermissions.has(id))
                      .map((permission) => (
                        <div
                          className="rounded-xl bg-stone-50 p-3 dark:bg-stone-900"
                          key={permission.id}
                        >
                          <p className="text-sm font-medium">
                            {permission.name}
                          </p>
                          <p className="text-xs text-stone-500">
                            {permission.code}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          )}
          {activeTab === "permissions" && editing && targetIsSuperAdmin && (
            <section className="mt-7 space-y-5">
              <div className="rounded-2xl border border-brand-muted/60 bg-brand-muted/15 p-4 text-sm text-brand-primary dark:border-brand-secondary dark:bg-brand-primary/30 dark:text-brand-muted">
                Super Admin permissions are locked. Every current and future
                platform permission is enabled automatically.
              </div>
              {permissionModules.map(([module, items]) => (
                <section
                  className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800"
                  key={module}
                >
                  <h3 className="font-semibold capitalize">{module}</h3>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((permission) => (
                      <label
                        className="flex cursor-not-allowed items-start gap-3 rounded-xl bg-stone-50 p-3 opacity-75 dark:bg-stone-900"
                        key={permission.id}
                      >
                        <input checked disabled readOnly type="checkbox" />
                        <span>
                          <span className="block text-sm font-medium">
                            {permission.name}
                          </span>
                          <span className="text-xs text-stone-500">
                            {permission.code} · Super Admin
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </section>
          )}
          {activeTab === "audit-logs" && !creating && !editing && detail && (
            <section className="mt-7 max-w-5xl space-y-3">
              {detail.auditLogs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-sm text-stone-500 dark:border-stone-700">
                  No audit activity recorded for this administrator.
                </div>
              ) : (
                detail.auditLogs.map((audit) => (
                  <article
                    className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800"
                    key={audit.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {audit.action.replaceAll(".", " ")}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-stone-500">
                          {audit.resourceType.replaceAll("_", " ")}
                        </p>
                      </div>
                      <time
                        className="text-sm text-stone-500"
                        dateTime={audit.createdAt}
                      >
                        {new Date(audit.createdAt).toLocaleString()}
                      </time>
                    </div>
                    {audit.reason && (
                      <p className="mt-3 text-sm">{audit.reason}</p>
                    )}
                    {audit.ipAddress && (
                      <p className="mt-3 text-xs text-stone-500">
                        IP: {audit.ipAddress}
                      </p>
                    )}
                  </article>
                ))
              )}
            </section>
          )}
          {activeTab === "permissions" &&
            (creating || editing) &&
            !targetIsSuperAdmin && (
            <section className="mt-7">
              {permissionNote && (
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <Check className="size-5" />
                  <span className="flex-1">{permissionNote}</span>
                  <button
                    className="font-semibold underline"
                    onClick={resetPermissions}
                  >
                    Reset permissions
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative min-w-64 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <input
                    className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 dark:border-stone-700 dark:bg-stone-900"
                    onChange={(event) =>
                      setPermissionSearch(event.target.value)
                    }
                    placeholder="Search permissions"
                    value={permissionSearch}
                  />
                </label>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updatePermissionSelection(
                      filteredPermissions.map(({ id }) => id),
                      true,
                    )
                  }
                >
                  Select filtered
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updatePermissionSelection(
                      filteredPermissions.map(({ id }) => id),
                      false,
                    )
                  }
                >
                  Deselect filtered
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updatePermissionSelection(
                      permissions.map(({ id }) => id),
                      true,
                    )
                  }
                >
                  Select all
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={() =>
                    updatePermissionSelection(
                      permissions.map(({ id }) => id),
                      false,
                    )
                  }
                >
                  Deselect all
                </button>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  onClick={resetPermissions}
                >
                  Reset permissions
                </button>
              </div>
              <p className="mt-4 text-sm text-stone-500">
                {selectedPermissions.size} of {permissions.length} permissions
                selected
              </p>
              <div className="mt-5 space-y-5">
                {permissionModules.map(([module, items = []]) => (
                  <section
                    className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800"
                    key={module}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="flex items-center gap-2 font-semibold capitalize">
                        <Shield className="size-4" />
                        {module}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          className="text-xs font-semibold text-brand-primary"
                          onClick={() =>
                            updatePermissionSelection(
                              items.map(({ id }) => id),
                              true,
                            )
                          }
                        >
                          Select all
                        </button>
                        <button
                          className="text-xs font-semibold text-stone-500"
                          onClick={() =>
                            updatePermissionSelection(
                              items.map(({ id }) => id),
                              false,
                            )
                          }
                        >
                          Deselect all
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((permission) => (
                        <label
                          className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-900"
                          key={permission.id}
                        >
                          <input
                            checked={selectedPermissions.has(permission.id)}
                            onChange={(event) =>
                              updatePermissionSelection(
                                [permission.id],
                                event.target.checked,
                              )
                            }
                            type="checkbox"
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {permission.name}
                            </span>
                            <span className="text-xs text-stone-500">
                              {permission.code}
                              {inheritedPermissions.has(permission.id)
                                ? " · Inherited"
                                : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <button
                className="mt-6 rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-50"
                disabled={busy || selectedRoles.length === 0}
                onClick={
                  creating
                    ? form.handleSubmit(createAdmin)
                    : () => void savePermissions()
                }
              >
                {creating ? "Create administrator" : "Save permissions"}
              </button>
            </section>
          )}
        </Offcanvas>
      )}
    </div>
  );
}
