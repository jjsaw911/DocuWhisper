import pg from "pg";

const { Client } = pg;

type Args = {
  oldUserId: string;
  newUserId: string;
  dryRun: boolean;
};

type UpdateTarget = {
  table: string;
  column: string;
  label?: string;
};

const SIMPLE_UPDATES: UpdateTarget[] = [
  { table: "notes", column: "user_id" },
  { table: "tasks", column: "user_id" },
  { table: "invites", column: "used_by" },
  { table: "practices", column: "owner_id" },
  { table: "practice_members", column: "user_id" },
  { table: "practice_members", column: "invited_by" },
  { table: "shared_notes", column: "shared_by" },
  { table: "shared_notes", column: "shared_with_user_id" },
  { table: "patients", column: "user_id" },
  { table: "appointments", column: "user_id" },
  { table: "patient_documents", column: "user_id" },
  { table: "patient_vitals", column: "recorded_by" },
  { table: "patient_encounters", column: "provider_id" },
  { table: "patient_encounters", column: "signed_by" },
  { table: "patient_encounters", column: "cosigned_by" },
  { table: "audit_logs", column: "user_id" },
  { table: "transcription_metrics", column: "user_id" },
  { table: "api_keys", column: "created_by" },
  { table: "api_keys", column: "revoked_by" },
  { table: "personal_api_keys", column: "user_id" },
  { table: "user_settings", column: "supervising_physician_id" },
];

const USER_SETTINGS_COLUMNS = [
  "first_name",
  "last_name",
  "preferred_name",
  "credentials",
  "specialty",
  "practice_name",
  "emr_role",
  "license_number",
  "license_state",
  "license_expiry",
  "npi_number",
  "dea_number",
  "dea_expiry",
  "supervising_physician_id",
  "requires_cosignature",
  "language",
  "default_template_id",
  "note_style",
  "note_font_size",
  "sidebar_collapsed",
  "auto_save_enabled",
  "show_timestamps",
  "transcription_mode",
  "noise_threshold",
  "email_notifications_enabled",
  "email_digest_time",
  "emr_consent_acknowledged",
  "emr_consent_date",
  "session_timeout_minutes",
  "require_reauth_for_phi",
] as const;

const SUBSCRIPTION_COLUMNS = [
  "stripe_customer_id",
  "stripe_subscription_id",
  "status",
  "current_period_end",
  "has_emr_access",
] as const;

function parseArgs(argv: string[]): Args {
  const oldUserId = readFlag(argv, "--old-user-id");
  const newUserId = readFlag(argv, "--new-user-id");
  const dryRun = argv.includes("--dry-run");

  if (!oldUserId || !newUserId) {
    throw new Error(
      "Usage: tsx scripts/remap-user-id.ts --old-user-id <old> --new-user-id <new> [--dry-run]"
    );
  }

  if (oldUserId === newUserId) {
    throw new Error("Old and new user IDs must be different.");
  }

  return { oldUserId, newUserId, dryRun };
}

function readFlag(argv: string[], flag: string): string {
  const index = argv.indexOf(flag);
  if (index === -1) return "";
  return argv[index + 1] ?? "";
}

function chooseStatus(oldStatus: string | null, nextStatus: string | null): string | null {
  const score = (value: string | null) => {
    switch (value) {
      case "active":
        return 4;
      case "trial":
        return 3;
      case "past_due":
        return 2;
      case "canceled":
        return 1;
      case "inactive":
      default:
        return 0;
    }
  };

  return score(oldStatus) >= score(nextStatus) ? oldStatus : nextStatus;
}

function chooseLaterDate(oldValue: Date | null, nextValue: Date | null): Date | null {
  if (!oldValue) return nextValue;
  if (!nextValue) return oldValue;
  return oldValue > nextValue ? oldValue : nextValue;
}

async function countRows(client: pg.Client, table: string, column: string, value: string) {
  const result = await client.query<{ count: string }>(
    `select count(*)::text as count from ${table} where ${column} = $1`,
    [value]
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

async function runSimpleUpdate(
  client: pg.Client,
  table: string,
  column: string,
  oldUserId: string,
  newUserId: string
) {
  const result = await client.query(
    `update ${table} set ${column} = $2 where ${column} = $1`,
    [oldUserId, newUserId]
  );
  return result.rowCount ?? 0;
}

async function remapTemplateShares(client: pg.Client, oldUserId: string, newUserId: string) {
  const result = await client.query(
    `update templates
       set shared_with = array_replace(shared_with, $1, $2)
     where shared_with is not null
       and $1 = any(shared_with)`,
    [oldUserId, newUserId]
  );
  return result.rowCount ?? 0;
}

async function getRowByUserId(client: pg.Client, table: string, userId: string) {
  const result = await client.query(`select * from ${table} where user_id = $1 limit 1`, [userId]);
  return result.rows[0] ?? null;
}

async function mergeUsers(client: pg.Client, oldUserId: string, newUserId: string) {
  const oldResult = await client.query("select * from users where id = $1 limit 1", [oldUserId]);
  const newResult = await client.query("select * from users where id = $1 limit 1", [newUserId]);
  const oldUser = oldResult.rows[0] ?? null;
  const newUser = newResult.rows[0] ?? null;

  if (!newUser) {
    throw new Error(`New user ${newUserId} does not exist in users table.`);
  }

  if (!oldUser) {
    return { merged: false, deletedOld: false };
  }

  await client.query(
    `update users
        set first_name = coalesce(first_name, $1),
            last_name = coalesce(last_name, $2),
            profile_image_url = coalesce(profile_image_url, $3),
            updated_at = now()
      where id = $4`,
    [oldUser.first_name, oldUser.last_name, oldUser.profile_image_url, newUserId]
  );

  await client.query("delete from users where id = $1", [oldUserId]);
  return { merged: true, deletedOld: true };
}

async function mergeUserSettings(client: pg.Client, oldUserId: string, newUserId: string) {
  const oldRow = await getRowByUserId(client, "user_settings", oldUserId);
  const newRow = await getRowByUserId(client, "user_settings", newUserId);

  if (!oldRow) {
    return { merged: false, moved: false };
  }

  if (!newRow) {
    await client.query("update user_settings set user_id = $2, updated_at = now() where user_id = $1", [
      oldUserId,
      newUserId,
    ]);
    return { merged: false, moved: true };
  }

  const merged = Object.fromEntries(
    USER_SETTINGS_COLUMNS.map((column) => [column, oldRow[column] ?? newRow[column]])
  );

  const assignments = USER_SETTINGS_COLUMNS.map((column, index) => `${column} = $${index + 1}`).join(", ");
  const values = USER_SETTINGS_COLUMNS.map((column) => merged[column]);

  await client.query(
    `update user_settings
        set ${assignments},
            updated_at = now()
      where user_id = $${USER_SETTINGS_COLUMNS.length + 1}`,
    [...values, newUserId]
  );

  await client.query("delete from user_settings where user_id = $1", [oldUserId]);
  return { merged: true, moved: false };
}

async function mergeSubscriptions(client: pg.Client, oldUserId: string, newUserId: string) {
  const oldRow = await getRowByUserId(client, "subscriptions", oldUserId);
  const newRow = await getRowByUserId(client, "subscriptions", newUserId);

  if (!oldRow) {
    return { merged: false, moved: false };
  }

  if (!newRow) {
    await client.query("update subscriptions set user_id = $2, updated_at = now() where user_id = $1", [
      oldUserId,
      newUserId,
    ]);
    return { merged: false, moved: true };
  }

  const merged = {
    stripe_customer_id: oldRow.stripe_customer_id ?? newRow.stripe_customer_id,
    stripe_subscription_id: oldRow.stripe_subscription_id ?? newRow.stripe_subscription_id,
    status: chooseStatus(oldRow.status ?? null, newRow.status ?? null),
    current_period_end: chooseLaterDate(oldRow.current_period_end ?? null, newRow.current_period_end ?? null),
    has_emr_access: Boolean(oldRow.has_emr_access) || Boolean(newRow.has_emr_access),
  };

  const assignments = SUBSCRIPTION_COLUMNS.map((column, index) => `${column} = $${index + 1}`).join(", ");
  const values = SUBSCRIPTION_COLUMNS.map((column) => merged[column]);

  await client.query(
    `update subscriptions
        set ${assignments},
            updated_at = now()
      where user_id = $${SUBSCRIPTION_COLUMNS.length + 1}`,
    [...values, newUserId]
  );

  await client.query("delete from subscriptions where user_id = $1", [oldUserId]);
  return { merged: true, moved: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const summary: Record<string, number | string | boolean> = {
    oldUserId: args.oldUserId,
    newUserId: args.newUserId,
    dryRun: args.dryRun,
  };

  try {
    await client.query("begin");

    for (const target of SIMPLE_UPDATES) {
      const key = `${target.table}.${target.column}`;
      if (args.dryRun) {
        summary[key] = await countRows(client, target.table, target.column, args.oldUserId);
      } else {
        summary[key] = await runSimpleUpdate(
          client,
          target.table,
          target.column,
          args.oldUserId,
          args.newUserId
        );
      }
    }

    if (args.dryRun) {
      summary["templates.shared_with"] = await client
        .query<{ count: string }>(
          `select count(*)::text as count
             from templates
            where shared_with is not null
              and $1 = any(shared_with)`,
          [args.oldUserId]
        )
        .then((result) => Number.parseInt(result.rows[0]?.count ?? "0", 10));
    } else {
      summary["templates.shared_with"] = await remapTemplateShares(
        client,
        args.oldUserId,
        args.newUserId
      );
    }

    if (args.dryRun) {
      summary["user_settings.row"] = await countRows(client, "user_settings", "user_id", args.oldUserId);
      summary["subscriptions.row"] = await countRows(client, "subscriptions", "user_id", args.oldUserId);
      summary["users.row"] = await client
        .query<{ count: string }>("select count(*)::text as count from users where id = $1", [args.oldUserId])
        .then((result) => Number.parseInt(result.rows[0]?.count ?? "0", 10));
      await client.query("rollback");
    } else {
      const userSettingsSummary = await mergeUserSettings(client, args.oldUserId, args.newUserId);
      summary["user_settings.merged"] = userSettingsSummary.merged;
      summary["user_settings.moved"] = userSettingsSummary.moved;

      const subscriptionSummary = await mergeSubscriptions(client, args.oldUserId, args.newUserId);
      summary["subscriptions.merged"] = subscriptionSummary.merged;
      summary["subscriptions.moved"] = subscriptionSummary.moved;

      const userSummary = await mergeUsers(client, args.oldUserId, args.newUserId);
      summary["users.merged"] = userSummary.merged;
      summary["users.deletedOld"] = userSummary.deletedOld;

      await client.query("commit");
    }

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
