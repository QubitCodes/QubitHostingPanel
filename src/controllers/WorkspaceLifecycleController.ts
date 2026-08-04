import { and, count, desc, eq, isNull, max, sql } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import {
  customers,
  organisations,
  users,
  workspaceBillingProfiles,
  workspaceMemberships,
  workspaceOwnershipTransfers,
  workspaces,
  workspaceSubscriptions,
} from "@db/schema";
import type { z } from "zod";
import type {
  billingProfileSchema,
  billingProfileValuesSchema,
  convertWorkspaceSchema,
  ownershipTransferResponseSchema,
  ownershipTransferSchema,
  subscriptionCancellationSchema,
} from "@schemas/workspaceLifecycle";
import { recordAuditLog } from "@services/auditLogService";
import { authenticateSession } from "@services/auth/authenticatedSessionService";
import type { RequestMetadata } from "@utils/request";

type ConvertInput = z.infer<typeof convertWorkspaceSchema>;
type BillingInput = z.infer<typeof billingProfileSchema>;
type BillingValues = z.infer<typeof billingProfileValuesSchema>;
type TransferInput = z.infer<typeof ownershipTransferSchema>;
type TransferResponse = z.infer<typeof ownershipTransferResponseSchema>;
type CancellationInput = z.infer<typeof subscriptionCancellationSchema>;
async function customerActor(request: Request, metadata: RequestMetadata) {
  const actor = await authenticateSession(request, metadata);
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
    .limit(1);
  if (!customer) throw new Error("Customer not found.");
  return { userId: actor.userId, customerId: customer.id };
}
async function owner(
  request: Request,
  publicId: number,
  metadata: RequestMetadata,
) {
  const actor = await customerActor(request, metadata);
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, type: workspaces.type })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.customerId, actor.customerId),
        eq(workspaceMemberships.role, "owner"),
        eq(workspaceMemberships.status, "active"),
        isNull(workspaceMemberships.deletedAt),
      ),
    )
    .where(
      and(
        eq(workspaces.publicId, publicId),
        eq(workspaces.status, "active"),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!workspace) throw new Error("Workspace not found.");
  return { ...actor, workspace };
}
const billingFields = {
  id: workspaceBillingProfiles.id,
  version: workspaceBillingProfiles.version,
  displayName: workspaceBillingProfiles.displayName,
  legalName: workspaceBillingProfiles.legalName,
  contactEmail: workspaceBillingProfiles.contactEmail,
  contactCountryCode: workspaceBillingProfiles.contactCountryCode,
  contactMobile: workspaceBillingProfiles.contactMobile,
  gstin: workspaceBillingProfiles.gstin,
  addressLine1: workspaceBillingProfiles.addressLine1,
  addressLine2: workspaceBillingProfiles.addressLine2,
  city: workspaceBillingProfiles.city,
  region: workspaceBillingProfiles.region,
  postalCode: workspaceBillingProfiles.postalCode,
  countryCode: workspaceBillingProfiles.countryCode,
  sourceProfileId: workspaceBillingProfiles.sourceProfileId,
  createdAt: workspaceBillingProfiles.createdAt,
};

/** Owner-authorized workspace identity, billing, transfer, and subscription lifecycle. */
export class WorkspaceLifecycleController {
  public static async convert(
    request: Request,
    publicId: number,
    input: ConvertInput,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await owner(request, publicId, metadata);
      if (actor.workspace.type === "organisation")
        return resp.failure(
          "Workspace is already an organisation.",
          resp.codes.RESOURCE_ALREADY_EXISTS,
          undefined,
          null,
          undefined,
          409,
        );
      await db.transaction(async (transaction) => {
        await transaction
          .update(workspaces)
          .set({ type: "organisation", updatedAt: new Date() })
          .where(eq(workspaces.id, actor.workspace.id));
        await transaction
          .insert(organisations)
          .values({
            workspaceId: actor.workspace.id,
            displayName: input.displayName,
            legalName: input.legalName,
            gstin: input.gstin,
          });
      });
      await recordAuditLog({
        actorUserId: actor.userId,
        action: "workspace.converted_to_organisation",
        resourceType: "workspace",
        resourceId: actor.workspace.id,
        metadata: { publicId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Workspace converted without changing its identity.",
        { workspaceId: publicId, type: "organisation" },
        resp.codes.UPDATED,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error ? error.message : "Workspace conversion failed.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
  public static async billingIndex(
    request: Request,
    publicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await owner(request, publicId, metadata);
      return resp.success(
        "Billing profiles retrieved.",
        await db
          .select(billingFields)
          .from(workspaceBillingProfiles)
          .where(
            and(
              eq(workspaceBillingProfiles.workspaceId, actor.workspace.id),
              isNull(workspaceBillingProfiles.deletedAt),
            ),
          )
          .orderBy(desc(workspaceBillingProfiles.version)),
      );
    } catch {
      return resp.failure(
        "Workspace not found.",
        resp.codes.RESOURCE_NOT_FOUND,
        undefined,
        null,
        undefined,
        404,
      );
    }
  }
  public static async billingCreate(
    request: Request,
    publicId: number,
    input: BillingInput,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await owner(request, publicId, metadata);
      const profile = await db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${actor.workspace.id}, 0))`,
        );
        let values: BillingValues;
        let sourceProfileId: string | undefined;
        if ('sourceProfileId' in input) {
          const [source] = await transaction
            .select(billingFields)
            .from(workspaceBillingProfiles)
            .innerJoin(
              workspaceMemberships,
              and(
                eq(
                  workspaceMemberships.workspaceId,
                  workspaceBillingProfiles.workspaceId,
                ),
                eq(workspaceMemberships.customerId, actor.customerId),
                eq(workspaceMemberships.status, "active"),
                isNull(workspaceMemberships.deletedAt),
              ),
            )
            .where(
              and(
                eq(workspaceBillingProfiles.id, input.sourceProfileId),
                isNull(workspaceBillingProfiles.deletedAt),
              ),
            )
            .limit(1);
          if (!source)
            throw new Error("Source billing profile is unavailable.");
          values = {
            displayName: source.displayName,
            legalName: source.legalName ?? undefined,
            contactEmail: source.contactEmail,
            contactCountryCode: source.contactCountryCode ?? undefined,
            contactMobile: source.contactMobile ?? undefined,
            gstin: source.gstin ?? undefined,
            addressLine1: source.addressLine1,
            addressLine2: source.addressLine2 ?? undefined,
            city: source.city,
            region: source.region,
            postalCode: source.postalCode,
            countryCode: source.countryCode,
          };
          sourceProfileId = source.id;
        } else values = input;
        const [{ version }] = await transaction
          .select({ version: max(workspaceBillingProfiles.version) })
          .from(workspaceBillingProfiles)
          .where(eq(workspaceBillingProfiles.workspaceId, actor.workspace.id));
        const [created] = await transaction
          .insert(workspaceBillingProfiles)
          .values({
            workspaceId: actor.workspace.id,
            version: Number(version ?? 0) + 1,
            displayName: values.displayName,
            legalName: values.legalName,
            contactEmail: values.contactEmail,
            contactCountryCode: values.contactCountryCode,
            contactMobile: values.contactMobile,
            gstin: values.gstin,
            addressLine1: values.addressLine1,
            addressLine2: values.addressLine2,
            city: values.city,
            region: values.region,
            postalCode: values.postalCode,
            countryCode: values.countryCode,
            sourceProfileId,
            createdByUserId: actor.userId,
          })
          .returning(billingFields);
        return created;
      });
      if (!profile) throw new Error("Unable to create billing profile.");
      await recordAuditLog({
        actorUserId: actor.userId,
        action: "workspace.billing_profile_version_created",
        resourceType: "workspace_billing_profile",
        resourceId: profile.id,
        metadata: {
          publicId,
          version: profile.version,
          sourceProfileId: profile.sourceProfileId,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Immutable billing profile version created.",
        profile,
        resp.codes.CREATED,
        undefined,
        201,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error
          ? error.message
          : "Billing profile creation failed.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
  public static async transferCreate(
    request: Request,
    publicId: number,
    input: TransferInput,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await owner(request, publicId, metadata);
      const [recipient] = await db
        .select({ id: customers.id })
        .from(users)
        .innerJoin(
          customers,
          and(eq(customers.userId, users.id), isNull(customers.deletedAt)),
        )
        .where(
          and(
            eq(users.publicId, input.recipientUserPublicId),
            eq(users.status, "active"),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      if (!recipient || recipient.id === actor.customerId)
        return resp.failure(
          "Recipient is unavailable.",
          resp.codes.INVALID_INPUT_DATA,
          undefined,
          null,
          undefined,
          400,
        );
      const [transfer] = await db
        .insert(workspaceOwnershipTransfers)
        .values({
          workspaceId: actor.workspace.id,
          fromCustomerId: actor.customerId,
          toCustomerId: recipient.id,
          reason: input.reason,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        })
        .returning({
          id: workspaceOwnershipTransfers.id,
          expiresAt: workspaceOwnershipTransfers.expiresAt,
        });
      if (!transfer) throw new Error("Unable to initiate transfer.");
      await recordAuditLog({
        actorUserId: actor.userId,
        action: "workspace.ownership_transfer_requested",
        resourceType: "workspace_ownership_transfer",
        resourceId: transfer.id,
        metadata: {
          publicId,
          recipientUserPublicId: input.recipientUserPublicId,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Ownership transfer awaiting recipient confirmation.",
        transfer,
        resp.codes.ACCEPTED,
        undefined,
        202,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error ? error.message : "Ownership transfer failed.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
  public static async transfers(
    request: Request,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await customerActor(request, metadata);
      const rows = await db
        .select({
          id: workspaceOwnershipTransfers.id,
          status: workspaceOwnershipTransfers.status,
          reason: workspaceOwnershipTransfers.reason,
          expiresAt: workspaceOwnershipTransfers.expiresAt,
          workspacePublicId: workspaces.publicId,
          workspaceName: workspaces.name,
        })
        .from(workspaceOwnershipTransfers)
        .innerJoin(
          workspaces,
          eq(workspaces.id, workspaceOwnershipTransfers.workspaceId),
        )
        .where(
          and(
            eq(workspaceOwnershipTransfers.toCustomerId, actor.customerId),
            isNull(workspaceOwnershipTransfers.deletedAt),
          ),
        )
        .orderBy(desc(workspaceOwnershipTransfers.createdAt));
      return resp.success("Incoming ownership transfers retrieved.", rows);
    } catch {
      return resp.failure(
        "Authentication required.",
        resp.codes.AUTHENTICATION_ERROR,
        undefined,
        null,
        undefined,
        401,
      );
    }
  }
  public static async transferRespond(
    request: Request,
    transferId: string,
    input: TransferResponse,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await customerActor(request, metadata);
      const result = await db.transaction(async (transaction) => {
        const [transfer] = await transaction
          .select()
          .from(workspaceOwnershipTransfers)
          .where(
            and(
              eq(workspaceOwnershipTransfers.id, transferId),
              eq(workspaceOwnershipTransfers.toCustomerId, actor.customerId),
              eq(workspaceOwnershipTransfers.status, "pending"),
              isNull(workspaceOwnershipTransfers.deletedAt),
            ),
          )
          .limit(1);
        if (!transfer || transfer.expiresAt <= new Date())
          throw new Error("Transfer is unavailable or expired.");
        if (input.decision === "decline") {
          await transaction
            .update(workspaceOwnershipTransfers)
            .set({
              status: "declined",
              respondedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(workspaceOwnershipTransfers.id, transfer.id));
          return {
            workspaceId: transfer.workspaceId,
            accepted: false,
            replacementWorkspaceId: null,
          };
        }
        const now = new Date();
        await transaction
          .update(workspaceMemberships)
          .set({ role: "member", ownershipEndedAt: now, updatedAt: now })
          .where(
            and(
              eq(workspaceMemberships.workspaceId, transfer.workspaceId),
              eq(workspaceMemberships.customerId, transfer.fromCustomerId),
              eq(workspaceMemberships.role, "owner"),
              isNull(workspaceMemberships.deletedAt),
            ),
          );
        const [recipientMembership] = await transaction
          .select({ id: workspaceMemberships.id })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.workspaceId, transfer.workspaceId),
              eq(workspaceMemberships.customerId, transfer.toCustomerId),
              isNull(workspaceMemberships.deletedAt),
            ),
          )
          .limit(1);
        if (recipientMembership)
          await transaction
            .update(workspaceMemberships)
            .set({
              role: "owner",
              status: "active",
              ownershipStartedAt: now,
              ownershipEndedAt: null,
              updatedAt: now,
            })
            .where(eq(workspaceMemberships.id, recipientMembership.id));
        else
          await transaction
            .insert(workspaceMemberships)
            .values({
              workspaceId: transfer.workspaceId,
              customerId: transfer.toCustomerId,
              role: "owner",
              status: "active",
              ownershipStartedAt: now,
            });
        await transaction
          .update(workspaceOwnershipTransfers)
          .set({ status: "accepted", respondedAt: now, updatedAt: now })
          .where(eq(workspaceOwnershipTransfers.id, transfer.id));
        const [{ owned }] = await transaction
          .select({ owned: count() })
          .from(workspaceMemberships)
          .where(
            and(
              eq(workspaceMemberships.customerId, transfer.fromCustomerId),
              eq(workspaceMemberships.role, "owner"),
              eq(workspaceMemberships.status, "active"),
              isNull(workspaceMemberships.deletedAt),
            ),
          );
        let replacementWorkspaceId: number | null = null;
        if (!owned) {
          const [replacement] = await transaction
            .insert(workspaces)
            .values({
              name: "Personal Workspace",
              slug: `personal-${transfer.fromCustomerId.slice(0, 8)}-${Date.now()}`,
              type: "personal",
            })
            .returning({ id: workspaces.id, publicId: workspaces.publicId });
          if (replacement) {
            await transaction
              .insert(workspaceMemberships)
              .values({
                workspaceId: replacement.id,
                customerId: transfer.fromCustomerId,
                role: "owner",
                status: "active",
                ownershipStartedAt: now,
              });
            replacementWorkspaceId = replacement.publicId;
          }
        }
        return {
          workspaceId: transfer.workspaceId,
          accepted: true,
          replacementWorkspaceId,
        };
      });
      await recordAuditLog({
        actorUserId: actor.userId,
        action: `workspace.ownership_transfer_${input.decision === "accept" ? "accepted" : "declined"}`,
        resourceType: "workspace_ownership_transfer",
        resourceId: transferId,
        metadata: { replacementWorkspaceId: result.replacementWorkspaceId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        `Ownership transfer ${input.decision}ed.`,
        result,
        resp.codes.UPDATED,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error ? error.message : "Transfer response failed.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
  public static async subscriptionCancel(
    request: Request,
    publicId: number,
    input: CancellationInput,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const actor = await owner(request, publicId, metadata);
      const [subscription] = await db
        .update(workspaceSubscriptions)
        .set({
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          cancellationReason: input.cancelAtPeriodEnd ? input.reason : null,
          cancelledAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workspaceSubscriptions.workspaceId, actor.workspace.id),
            eq(workspaceSubscriptions.isPrimary, true),
            sql`${workspaceSubscriptions.status} IN ('active','trialing')`,
            isNull(workspaceSubscriptions.deletedAt),
          ),
        )
        .returning({
          id: workspaceSubscriptions.id,
          cancelAtPeriodEnd: workspaceSubscriptions.cancelAtPeriodEnd,
          termEndsAt: workspaceSubscriptions.termEndsAt,
        });
      if (!subscription)
        return resp.failure(
          "Active subscription not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      await recordAuditLog({
        actorUserId: actor.userId,
        action: input.cancelAtPeriodEnd
          ? "subscription.cancellation_scheduled"
          : "subscription.cancellation_reversed",
        resourceType: "workspace_subscription",
        resourceId: subscription.id,
        metadata: { publicId, reason: input.reason },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        input.cancelAtPeriodEnd
          ? "Subscription will cancel at term end."
          : "Scheduled cancellation removed.",
        subscription,
        resp.codes.UPDATED,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error ? error.message : "Subscription update failed.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
}
