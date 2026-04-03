import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { and, eq, inArray } from "drizzle-orm";
import type { UserRole } from "../auth/jwt";
import { env } from "../config/env";
import { db } from "../db";
import { notifications, staffBuildingAssignments, users } from "../db/schema";

type DbExecutor = typeof db | any;

export type NotificationType = (typeof notifications.$inferInsert)["type"];

export type NotificationDraft = {
  recipientId: number;
  subject: string;
  message: string;
  type: NotificationType;
};

type ActiveRecipient = {
  id: number;
  email: string;
  role: UserRole;
  name: string;
  displayName: string | null;
};

type NotificationDispatchResult = {
  createdCount: number;
  emailedCount: number;
};

function createMailTransporter(): nodemailer.Transporter | null {
  if (env.SMTP_HOST === null || env.SMTP_PORT === null) {
    return null;
  }

  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;
  const hasAuth = smtpUser !== null && smtpPass !== null;

  const transportOptions: SMTPTransport.Options = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    ...(hasAuth
      ? {
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        }
      : {}),
  };

  return nodemailer.createTransport(transportOptions);
}

const transporter = createMailTransporter();

function shouldSendEmailForRole(role: UserRole): boolean {
  return role === "FACULTY" || role === "STUDENT";
}

function normalizeDrafts(drafts: NotificationDraft[]): NotificationDraft[] {
  const deduped = new Map<string, NotificationDraft>();

  for (const draft of drafts) {
    if (!Number.isInteger(draft.recipientId) || draft.recipientId <= 0) {
      continue;
    }

    const subject = draft.subject.trim();
    const message = draft.message.trim();

    if (!subject || !message) {
      continue;
    }

    const normalizedDraft: NotificationDraft = {
      recipientId: draft.recipientId,
      subject,
      message,
      type: draft.type,
    };

    const dedupeKey = `${normalizedDraft.recipientId}|${normalizedDraft.type}|${normalizedDraft.subject}|${normalizedDraft.message}`;
    deduped.set(dedupeKey, normalizedDraft);
  }

  return [...deduped.values()];
}

async function getActiveRecipients(
  userIds: number[],
  executor: DbExecutor,
): Promise<ActiveRecipient[]> {
  if (userIds.length === 0) {
    return [];
  }

  return executor
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      name: users.name,
      displayName: users.displayName,
    })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.isActive, true)));
}

async function sendEmailNotification(
  recipient: ActiveRecipient,
  draft: NotificationDraft,
): Promise<boolean> {
  if (!shouldSendEmailForRole(recipient.role)) {
    return false;
  }

  if (transporter === null || env.SMTP_FROM === null) {
    return false;
  }

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: recipient.email,
      subject: draft.subject,
      text: draft.message,
    });

    return true;
  } catch (error) {
    console.error("Failed to send notification email", {
      recipientId: recipient.id,
      role: recipient.role,
      error,
    });
    return false;
  }
}

export async function sendRoleAwareNotifications(
  drafts: NotificationDraft[],
  executor: DbExecutor = db,
): Promise<NotificationDispatchResult> {
  const normalizedDrafts = normalizeDrafts(drafts);

  if (normalizedDrafts.length === 0) {
    return { createdCount: 0, emailedCount: 0 };
  }

  const recipientIds = Array.from(
    new Set(normalizedDrafts.map((draft) => draft.recipientId)),
  );

  const activeRecipients = await getActiveRecipients(recipientIds, executor);

  if (activeRecipients.length === 0) {
    return { createdCount: 0, emailedCount: 0 };
  }

  const recipientById = new Map(activeRecipients.map((recipient) => [recipient.id, recipient]));

  const insertPayload = normalizedDrafts
    .filter((draft) => recipientById.has(draft.recipientId))
    .map((draft) => ({
      recipientId: draft.recipientId,
      subject: draft.subject,
      message: draft.message,
      type: draft.type,
    }));

  if (insertPayload.length === 0) {
    return { createdCount: 0, emailedCount: 0 };
  }

  await executor.insert(notifications).values(insertPayload);

  let emailedCount = 0;

  for (const draft of normalizedDrafts) {
    const recipient = recipientById.get(draft.recipientId);

    if (!recipient) {
      continue;
    }

    const emailed = await sendEmailNotification(recipient, draft);

    if (emailed) {
      emailedCount += 1;
    }
  }

  return {
    createdCount: insertPayload.length,
    emailedCount,
  };
}

function isMissingAssignmentsTableError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const message =
    (cause?.message ?? (error as { message?: string })?.message ?? "").toLowerCase();

  return cause?.code === "42P01" && message.includes("staff_building_assignments");
}

export async function getActiveAdminIds(executor: DbExecutor = db): Promise<number[]> {
  const rows = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

  return rows.map((row: { id: number }) => row.id);
}

export async function getActiveStaffIdsForBuilding(
  buildingId: number,
  executor: DbExecutor = db,
): Promise<number[]> {
  try {
    const rows = await executor
      .select({ id: users.id })
      .from(staffBuildingAssignments)
      .innerJoin(users, eq(staffBuildingAssignments.staffId, users.id))
      .where(
        and(
          eq(staffBuildingAssignments.buildingId, buildingId),
          eq(users.role, "STAFF"),
          eq(users.isActive, true),
        ),
      );

    return rows.map((row: { id: number }) => row.id);
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return [];
    }

    throw error;
  }
}
