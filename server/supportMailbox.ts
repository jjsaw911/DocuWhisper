import { ImapFlow, type FetchMessageObject } from "imapflow";
import {
  simpleParser,
  type AddressObject,
  type Attachment,
  type EmailAddress,
  type ParsedMail,
} from "mailparser";
import nodemailer from "nodemailer";

export type SupportMailboxFolder = "inbox" | "sent" | "archive" | "trash";

export type SupportMailboxStatus = {
  configured: boolean;
  emailAddress: string | null;
  replyTo: string | null;
};

export type SupportMailboxAttachment = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  disposition: string;
};

export type SupportMailboxMessageSummary = {
  uid: number;
  folder: SupportMailboxFolder;
  subject: string;
  normalizedSubject: string;
  from: string;
  to: string;
  date: string | null;
  isRead: boolean;
  messageId: string | null;
  inReplyTo: string | null;
  threadId: string | null;
};

export type SupportMailboxMessageDetail = SupportMailboxMessageSummary & {
  cc: string;
  bodyText: string;
  fromAddress: string;
  replyToAddress: string;
  attachments: SupportMailboxAttachment[];
};

export type SupportMailboxAttachmentDownload = {
  content: Buffer;
  filename: string;
  contentType: string;
};

type SupportMailboxConfig = {
  user: string;
  pass: string;
  fromName: string;
  replyTo: string | null;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  folders: Record<SupportMailboxFolder, string>;
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readIntEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSupportMailboxConfig(): SupportMailboxConfig | null {
  const user = readEnv("SUPPORT_MAILBOX_USER");
  const pass = readEnv("SUPPORT_MAILBOX_PASSWORD");

  if (!user || !pass) {
    return null;
  }

  return {
    user,
    pass,
    fromName: readEnv("SUPPORT_MAILBOX_FROM_NAME") || "DocuWhisper Support",
    replyTo: readEnv("SUPPORT_MAILBOX_REPLY_TO") || null,
    imapHost: readEnv("SUPPORT_MAILBOX_IMAP_HOST") || "mail.privateemail.com",
    imapPort: readIntEnv("SUPPORT_MAILBOX_IMAP_PORT", 993),
    smtpHost: readEnv("SUPPORT_MAILBOX_SMTP_HOST") || "mail.privateemail.com",
    smtpPort: readIntEnv("SUPPORT_MAILBOX_SMTP_PORT", 465),
    smtpSecure: readEnv("SUPPORT_MAILBOX_SMTP_SECURE")
      ? readEnv("SUPPORT_MAILBOX_SMTP_SECURE").toLowerCase() !== "false"
      : true,
    folders: {
      inbox: readEnv("SUPPORT_MAILBOX_INBOX_FOLDER") || "INBOX",
      sent: readEnv("SUPPORT_MAILBOX_SENT_FOLDER") || "Sent",
      archive: readEnv("SUPPORT_MAILBOX_ARCHIVE_FOLDER") || "Archive",
      trash: readEnv("SUPPORT_MAILBOX_TRASH_FOLDER") || "Trash",
    },
  };
}

function requireSupportMailboxConfig(): SupportMailboxConfig {
  const config = getSupportMailboxConfig();
  if (!config) {
    throw new Error("Support mailbox is not configured.");
  }
  return config;
}

function getFolderName(config: SupportMailboxConfig, folder: SupportMailboxFolder): string {
  return config.folders[folder];
}

function normalizeThreadSubject(subject: string | null | undefined): string {
  return (subject || "")
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatAddressList(
  addresses:
    | Array<{ name?: string | null; address?: string | null }>
    | null
    | undefined,
): string {
  if (!addresses?.length) return "";
  return addresses
    .map((entry) => {
      const address = entry.address?.trim() || "";
      const name = entry.name?.trim() || "";
      if (name && address) return `${name} <${address}>`;
      return address || name;
    })
    .filter(Boolean)
    .join(", ");
}

function firstAddress(
  addresses:
    | Array<{ name?: string | null; address?: string | null }>
    | null
    | undefined,
): string {
  return addresses?.find((entry) => Boolean(entry.address?.trim()))?.address?.trim() || "";
}

function flattenParsedAddresses(
  value: AddressObject | AddressObject[] | null | undefined,
): EmailAddress[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((entry) => entry.value || []);
}

function normalizeMessageDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function summarizeEnvelope(
  folder: SupportMailboxFolder,
  message: Pick<FetchMessageObject, "uid" | "envelope" | "flags" | "internalDate" | "threadId">,
): SupportMailboxMessageSummary {
  const envelope = message.envelope || null;
  const date =
    normalizeMessageDate(envelope?.date ?? null) ??
    normalizeMessageDate(message.internalDate ?? null);
  const subject = envelope?.subject?.trim() || "(No subject)";

  return {
    uid: message.uid,
    folder,
    subject,
    normalizedSubject: normalizeThreadSubject(subject),
    from: formatAddressList(envelope?.from),
    to: formatAddressList(envelope?.to),
    date: date ? date.toISOString() : null,
    isRead: Boolean(message.flags?.has("\\Seen")),
    messageId: envelope?.messageId?.trim() || null,
    inReplyTo: envelope?.inReplyTo?.trim() || null,
    threadId: message.threadId?.trim() || null,
  };
}

function buildAttachmentMeta(attachment: Attachment, index: number): SupportMailboxAttachment {
  return {
    index,
    filename: attachment.filename || `attachment-${index + 1}`,
    contentType: attachment.contentType || "application/octet-stream",
    size: attachment.size || 0,
    disposition: attachment.contentDisposition || "attachment",
  };
}

function buildDetailFromParsedMessage(
  folder: SupportMailboxFolder,
  message: FetchMessageObject,
  parsed: ParsedMail,
  markRead: boolean,
): SupportMailboxMessageDetail {
  const summary = summarizeEnvelope(folder, message);

  return {
    ...summary,
    from: formatAddressList(flattenParsedAddresses(parsed.from)),
    to: formatAddressList(flattenParsedAddresses(parsed.to)),
    cc: formatAddressList(flattenParsedAddresses(parsed.cc)),
    bodyText: parsed.text?.trim() || "",
    fromAddress: firstAddress(flattenParsedAddresses(parsed.from)),
    replyToAddress:
      firstAddress(flattenParsedAddresses(parsed.replyTo)) ||
      firstAddress(flattenParsedAddresses(parsed.from)),
    attachments: parsed.attachments.map((attachment, index) => buildAttachmentMeta(attachment, index)),
    isRead: markRead ? true : summary.isRead,
  };
}

async function ensureMailboxExists(client: ImapFlow, path: string): Promise<void> {
  const mailboxes = await client.list();
  if (mailboxes.some((mailbox) => mailbox.path === path)) {
    return;
  }
  await client.mailboxCreate(path);
}

async function withMailbox<T>(
  folder: SupportMailboxFolder,
  fn: (client: ImapFlow, config: SupportMailboxConfig) => Promise<T>,
): Promise<T> {
  const config = requireSupportMailboxConfig();
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(getFolderName(config, folder));
  try {
    return await fn(client, config);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

async function fetchMessageOrNull(
  client: ImapFlow,
  uid: number,
  includeSource = false,
): Promise<FetchMessageObject | null> {
  const message = await client.fetchOne(
    uid,
    {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
      threadId: true,
      source: includeSource,
    },
    { uid: true },
  );

  return message || null;
}

async function parseMessageSource(message: FetchMessageObject): Promise<ParsedMail | null> {
  if (!message.source) {
    return null;
  }
  return simpleParser(message.source);
}

export function getSupportMailboxStatus(): SupportMailboxStatus {
  const config = getSupportMailboxConfig();
  return {
    configured: Boolean(config),
    emailAddress: config?.user || null,
    replyTo: config?.replyTo || null,
  };
}

export async function getSupportMailboxUnreadCount(): Promise<number> {
  return withMailbox("inbox", async (client) => {
    const unread = await client.search({ seen: false }, { uid: true });
    return Array.isArray(unread) ? unread.length : 0;
  });
}

export async function listSupportMailboxMessages(params?: {
  folder?: SupportMailboxFolder;
  limit?: number;
  query?: string;
}): Promise<SupportMailboxMessageSummary[]> {
  const folder = params?.folder || "inbox";
  const limit = Math.min(Math.max(params?.limit ?? 25, 1), 100);
  const query = params?.query?.trim() || "";

  return withMailbox(folder, async (client) => {
    let messageUids: number[] = [];

    if (query) {
      const results = await client.search(
        {
          or: [{ subject: query }, { from: query }, { to: query }, { text: query }],
        },
        { uid: true },
      );
      messageUids = (results || []).sort((left, right) => left - right).slice(-limit);
    } else {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      if (exists <= 0) {
        return [];
      }

      const start = Math.max(1, exists - limit + 1);
      for await (const message of client.fetch(`${start}:*`, { uid: true }, { uid: true })) {
        messageUids.push(message.uid);
      }
    }

    if (messageUids.length === 0) {
      return [];
    }

    const messages: SupportMailboxMessageSummary[] = [];
    for await (const message of client.fetch(
      messageUids,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        threadId: true,
      },
      { uid: true },
    )) {
      messages.push(summarizeEnvelope(folder, message));
    }

    return messages
      .sort((left, right) => {
        const leftTime = left.date ? new Date(left.date).getTime() : 0;
        const rightTime = right.date ? new Date(right.date).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, limit);
  });
}

export async function getSupportMailboxMessage(params: {
  folder?: SupportMailboxFolder;
  uid: number;
  markRead?: boolean;
}): Promise<SupportMailboxMessageDetail | null> {
  const folder = params.folder || "inbox";

  return withMailbox(folder, async (client) => {
    if (params.markRead) {
      await client.messageFlagsAdd(params.uid, ["\\Seen"], { uid: true });
    }

    const message = await fetchMessageOrNull(client, params.uid, true);
    if (!message) {
      return null;
    }

    const parsed = await parseMessageSource(message);
    if (!parsed) {
      return null;
    }

    return buildDetailFromParsedMessage(folder, message, parsed, Boolean(params.markRead));
  });
}

export async function downloadSupportMailboxAttachment(params: {
  folder?: SupportMailboxFolder;
  uid: number;
  index: number;
}): Promise<SupportMailboxAttachmentDownload | null> {
  const folder = params.folder || "inbox";

  return withMailbox(folder, async (client) => {
    const message = await fetchMessageOrNull(client, params.uid, true);
    if (!message) {
      return null;
    }

    const parsed = await parseMessageSource(message);
    const attachment = parsed?.attachments?.[params.index];
    if (!attachment || !Buffer.isBuffer(attachment.content)) {
      return null;
    }

    return {
      content: attachment.content,
      filename: attachment.filename || `attachment-${params.index + 1}`,
      contentType: attachment.contentType || "application/octet-stream",
    };
  });
}

export async function moveSupportMailboxMessage(params: {
  folder: SupportMailboxFolder;
  uid: number;
  destination: Exclude<SupportMailboxFolder, "sent">;
}): Promise<boolean> {
  return withMailbox(params.folder, async (client, config) => {
    const destinationFolder = getFolderName(config, params.destination);
    await ensureMailboxExists(client, destinationFolder);
    const response = await client.messageMove(params.uid, destinationFolder, { uid: true });
    return Boolean(response);
  });
}

function conversationMatch(
  target: SupportMailboxMessageSummary,
  candidate: SupportMailboxMessageSummary,
): boolean {
  if (target.threadId && candidate.threadId && target.threadId === candidate.threadId) {
    return true;
  }

  if (target.messageId) {
    if (candidate.messageId === target.messageId) return true;
    if (candidate.inReplyTo === target.messageId) return true;
  }

  if (candidate.messageId && target.inReplyTo === candidate.messageId) {
    return true;
  }

  return Boolean(target.normalizedSubject) && target.normalizedSubject === candidate.normalizedSubject;
}

export async function getSupportMailboxConversation(params: {
  folder?: SupportMailboxFolder;
  uid: number;
  limit?: number;
}): Promise<SupportMailboxMessageSummary[]> {
  const folder = params.folder || "inbox";
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const target = await withMailbox(folder, async (client) => {
    const message = await fetchMessageOrNull(client, params.uid, false);
    return message ? summarizeEnvelope(folder, message) : null;
  });

  if (!target) {
    return [];
  }

  const folders: SupportMailboxFolder[] = ["inbox", "sent", "archive", "trash"];
  const conversation = new Map<string, SupportMailboxMessageSummary>();

  await Promise.all(
    folders.map(async (currentFolder) => {
      const candidates = await listSupportMailboxMessages({
        folder: currentFolder,
        limit: 100,
        query: target.subject === "(No subject)" ? "" : target.normalizedSubject || target.subject,
      });

      candidates
        .filter((candidate) => conversationMatch(target, candidate))
        .forEach((candidate) => {
          conversation.set(`${candidate.folder}:${candidate.uid}`, candidate);
        });
    }),
  );

  return Array.from(conversation.values())
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return leftTime - rightTime;
    })
    .slice(-limit);
}

export async function sendSupportMailboxMessage(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const config = requireSupportMailboxConfig();
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transport.sendMail({
    from: `"${config.fromName}" <${config.user}>`,
    replyTo: config.replyTo || undefined,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });
}
