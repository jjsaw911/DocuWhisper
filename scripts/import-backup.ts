import fs from "fs";
import pg from "pg";

const { Client } = pg;

type BackupPayload = {
  version: number;
  exportedAt: string;
  account: {
    userId: string;
    email: string | null;
    settings: Record<string, unknown> | null;
    subscription: Record<string, unknown> | null;
    emrOrganizations: Array<unknown>;
  };
  scribe: {
    notes: Array<Record<string, unknown>>;
    templates: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  };
  emr: {
    patients: Array<Record<string, unknown>>;
    appointments: Array<Record<string, unknown>>;
    encounters: Array<Record<string, unknown>>;
    vitals: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    linkedNotes: Array<Record<string, unknown>>;
  };
};

type Args = {
  file: string;
  targetUserId: string;
  targetPracticeId?: number;
  force: boolean;
};

function usage(): never {
  throw new Error(
    "Usage: node --import tsx scripts/import-backup.ts --file <backup.json> --target-user-id <firebaseUid> [--target-practice-id <id>] [--force]"
  );
}

function readFlag(argv: string[], flag: string): string {
  const index = argv.indexOf(flag);
  if (index === -1) return "";
  return argv[index + 1] ?? "";
}

function parseArgs(argv: string[]): Args {
  const file = readFlag(argv, "--file");
  const targetUserId = readFlag(argv, "--target-user-id");
  const targetPracticeIdValue = readFlag(argv, "--target-practice-id");
  const force = argv.includes("--force");

  if (!file || !targetUserId) usage();

  const targetPracticeId = targetPracticeIdValue ? Number.parseInt(targetPracticeIdValue, 10) : undefined;
  if (targetPracticeIdValue && !Number.isFinite(targetPracticeId)) {
    throw new Error("Invalid --target-practice-id");
  }

  return {
    file,
    targetUserId,
    targetPracticeId,
    force,
  };
}

function parseJsonDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNullableInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseNullableBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value == null) return null;
  return Boolean(value);
}

function parseNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function remapSharedWith(sharedWith: unknown, sourceUserId: string, targetUserId: string): string[] | null {
  if (!Array.isArray(sharedWith)) return null;
  const remapped = sharedWith
    .map((value) => (typeof value === "string" ? (value === sourceUserId ? targetUserId : value) : null))
    .filter((value): value is string => Boolean(value));
  return remapped;
}

function chooseDefaultPracticeId(practiceIds: number[], requested?: number): number | null {
  if (requested && practiceIds.includes(requested)) return requested;
  if (practiceIds.length === 1) return practiceIds[0];
  return null;
}

async function queryOne<T>(client: pg.Client, sqlText: string, values: unknown[] = []): Promise<T | null> {
  const result = await client.query<T>(sqlText, values);
  return (result.rows[0] as T | undefined) ?? null;
}

async function ensureTargetUser(client: pg.Client, targetUserId: string) {
  const user = await queryOne<{ id: string; email: string | null }>(
    client,
    "select id, email from users where id = $1",
    [targetUserId]
  );
  if (!user) {
    throw new Error(`Target user ${targetUserId} does not exist in users.`);
  }
  return user;
}

async function getOwnedPracticeIds(client: pg.Client, targetUserId: string) {
  const result = await client.query<{ id: number }>(
    "select id from practices where owner_id = $1 order by id",
    [targetUserId]
  );
  return result.rows.map((row) => row.id);
}

async function maybeAbortOnPriorImport(
  client: pg.Client,
  sourceUserId: string,
  targetUserId: string,
  force: boolean
) {
  const result = await client.query<{ count: string }>(
    `select count(*)::text as count
       from audit_logs
      where action = 'import'
        and resource_type = 'backup'
        and user_id = $1
        and details like $2`,
    [targetUserId, `%\"sourceUserId\":\"${sourceUserId}\"%`]
  );
  const count = Number.parseInt(result.rows[0]?.count ?? "0", 10);
  if (count > 0 && !force) {
    throw new Error(
      `A backup import for source user ${sourceUserId} was already recorded for ${targetUserId}. Re-run with --force if you really want duplicates.`
    );
  }
}

async function upsertUserSettings(
  client: pg.Client,
  targetUserId: string,
  settings: Record<string, unknown> | null,
  mappedDefaultTemplateId: number | null
) {
  if (!settings) return false;

  const payload = {
    first_name: parseNullableString(settings.firstName),
    last_name: parseNullableString(settings.lastName),
    preferred_name: parseNullableString(settings.preferredName),
    credentials: parseNullableString(settings.credentials),
    specialty: parseNullableString(settings.specialty),
    practice_name: parseNullableString(settings.practiceName),
    emr_role: parseNullableString(settings.emrRole),
    license_number: parseNullableString(settings.licenseNumber),
    license_state: parseNullableString(settings.licenseState),
    license_expiry: parseJsonDate(settings.licenseExpiry),
    npi_number: parseNullableString(settings.npiNumber),
    dea_number: parseNullableString(settings.deaNumber),
    dea_expiry: parseJsonDate(settings.deaExpiry),
    supervising_physician_id: parseNullableString(settings.supervisingPhysicianId),
    requires_cosignature: parseNullableBool(settings.requiresCosignature),
    language: parseNullableString(settings.language),
    default_template_id: mappedDefaultTemplateId,
    note_style: parseNullableString(settings.noteStyle),
    note_font_size: parseNullableString(settings.noteFontSize),
    sidebar_collapsed: parseNullableBool(settings.sidebarCollapsed),
    auto_save_enabled: parseNullableBool(settings.autoSaveEnabled),
    show_timestamps: parseNullableBool(settings.showTimestamps),
    transcription_mode: parseNullableString(settings.transcriptionMode),
    noise_threshold: parseNullableInt(settings.noiseThreshold),
    email_notifications_enabled: parseNullableBool(settings.emailNotificationsEnabled),
    email_digest_time: parseNullableString(settings.emailDigestTime),
    emr_consent_acknowledged: parseNullableBool(settings.emrConsentAcknowledged),
    emr_consent_date: parseJsonDate(settings.emrConsentDate),
    session_timeout_minutes: parseNullableInt(settings.sessionTimeoutMinutes),
    require_reauth_for_phi: parseNullableBool(settings.requireReauthForPhi),
  };

  await client.query(
    `insert into user_settings (
      user_id, first_name, last_name, preferred_name, credentials, specialty, practice_name,
      emr_role, license_number, license_state, license_expiry, npi_number, dea_number, dea_expiry,
      supervising_physician_id, requires_cosignature, language, default_template_id, note_style,
      note_font_size, sidebar_collapsed, auto_save_enabled, show_timestamps, transcription_mode,
      noise_threshold, email_notifications_enabled, email_digest_time, emr_consent_acknowledged,
      emr_consent_date, session_timeout_minutes, require_reauth_for_phi, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,now()
    )
    on conflict (user_id) do update set
      first_name = coalesce(excluded.first_name, user_settings.first_name),
      last_name = coalesce(excluded.last_name, user_settings.last_name),
      preferred_name = coalesce(excluded.preferred_name, user_settings.preferred_name),
      credentials = coalesce(excluded.credentials, user_settings.credentials),
      specialty = coalesce(excluded.specialty, user_settings.specialty),
      practice_name = coalesce(excluded.practice_name, user_settings.practice_name),
      emr_role = coalesce(excluded.emr_role, user_settings.emr_role),
      license_number = coalesce(excluded.license_number, user_settings.license_number),
      license_state = coalesce(excluded.license_state, user_settings.license_state),
      license_expiry = coalesce(excluded.license_expiry, user_settings.license_expiry),
      npi_number = coalesce(excluded.npi_number, user_settings.npi_number),
      dea_number = coalesce(excluded.dea_number, user_settings.dea_number),
      dea_expiry = coalesce(excluded.dea_expiry, user_settings.dea_expiry),
      supervising_physician_id = coalesce(excluded.supervising_physician_id, user_settings.supervising_physician_id),
      requires_cosignature = coalesce(excluded.requires_cosignature, user_settings.requires_cosignature),
      language = coalesce(excluded.language, user_settings.language),
      default_template_id = coalesce(excluded.default_template_id, user_settings.default_template_id),
      note_style = coalesce(excluded.note_style, user_settings.note_style),
      note_font_size = coalesce(excluded.note_font_size, user_settings.note_font_size),
      sidebar_collapsed = coalesce(excluded.sidebar_collapsed, user_settings.sidebar_collapsed),
      auto_save_enabled = coalesce(excluded.auto_save_enabled, user_settings.auto_save_enabled),
      show_timestamps = coalesce(excluded.show_timestamps, user_settings.show_timestamps),
      transcription_mode = coalesce(excluded.transcription_mode, user_settings.transcription_mode),
      noise_threshold = coalesce(excluded.noise_threshold, user_settings.noise_threshold),
      email_notifications_enabled = coalesce(excluded.email_notifications_enabled, user_settings.email_notifications_enabled),
      email_digest_time = coalesce(excluded.email_digest_time, user_settings.email_digest_time),
      emr_consent_acknowledged = coalesce(excluded.emr_consent_acknowledged, user_settings.emr_consent_acknowledged),
      emr_consent_date = coalesce(excluded.emr_consent_date, user_settings.emr_consent_date),
      session_timeout_minutes = coalesce(excluded.session_timeout_minutes, user_settings.session_timeout_minutes),
      require_reauth_for_phi = coalesce(excluded.require_reauth_for_phi, user_settings.require_reauth_for_phi),
      updated_at = now()`,
    [
      targetUserId,
      payload.first_name,
      payload.last_name,
      payload.preferred_name,
      payload.credentials,
      payload.specialty,
      payload.practice_name,
      payload.emr_role,
      payload.license_number,
      payload.license_state,
      payload.license_expiry,
      payload.npi_number,
      payload.dea_number,
      payload.dea_expiry,
      payload.supervising_physician_id,
      payload.requires_cosignature,
      payload.language,
      payload.default_template_id,
      payload.note_style,
      payload.note_font_size,
      payload.sidebar_collapsed,
      payload.auto_save_enabled,
      payload.show_timestamps,
      payload.transcription_mode,
      payload.noise_threshold,
      payload.email_notifications_enabled,
      payload.email_digest_time,
      payload.emr_consent_acknowledged,
      payload.emr_consent_date,
      payload.session_timeout_minutes,
      payload.require_reauth_for_phi,
    ]
  );

  return true;
}

async function upsertSubscription(client: pg.Client, targetUserId: string, subscription: Record<string, unknown> | null) {
  if (!subscription) return false;

  await client.query(
    `insert into subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, status,
      current_period_end, has_emr_access, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, subscriptions.stripe_subscription_id),
      status = coalesce(excluded.status, subscriptions.status),
      current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
      has_emr_access = coalesce(excluded.has_emr_access, subscriptions.has_emr_access),
      updated_at = now()`,
    [
      targetUserId,
      parseNullableString(subscription.stripeCustomerId),
      parseNullableString(subscription.stripeSubscriptionId),
      parseNullableString(subscription.status),
      parseJsonDate(subscription.currentPeriodEnd),
      parseNullableBool(subscription.hasEmrAccess),
      parseJsonDate(subscription.createdAt) ?? new Date(),
      parseJsonDate(subscription.updatedAt) ?? new Date(),
    ]
  );

  return true;
}

async function insertTemplate(
  client: pg.Client,
  row: Record<string, unknown>,
  sourceUserId: string,
  targetUserId: string
) {
  const result = await client.query<{ id: number }>(
    `insert into templates (
      user_id, name, description, prompt, is_default, is_public, shared_with, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id`,
    [
      targetUserId,
      parseNullableString(row.name),
      parseNullableString(row.description),
      parseNullableString(row.prompt),
      parseNullableBool(row.isDefault) ?? false,
      parseNullableBool(row.isPublic) ?? false,
      remapSharedWith(row.sharedWith, sourceUserId, targetUserId),
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
  return result.rows[0].id;
}

async function maybeRenamePractice(
  client: pg.Client,
  practiceId: number | null,
  practiceName: string | null
) {
  if (!practiceId || !practiceName) return false;

  await client.query(
    "update practices set name = $2, updated_at = now() where id = $1",
    [practiceId, practiceName]
  );
  return true;
}

async function insertPatient(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  targetPracticeId: number | null
) {
  const mappedOrganizationId = row.organizationId == null ? null : targetPracticeId;
  const result = await client.query<{ id: number }>(
    `insert into patients (
      user_id, organization_id, first_name, last_name, date_of_birth, gender, email, phone, address,
      insurance_provider, insurance_policy_number, medical_history, allergies, medications,
      emergency_contact_name, emergency_contact_phone, is_active, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    returning id`,
    [
      targetUserId,
      mappedOrganizationId,
      parseNullableString(row.firstName),
      parseNullableString(row.lastName),
      parseJsonDate(row.dateOfBirth),
      parseNullableString(row.gender),
      parseNullableString(row.email),
      parseNullableString(row.phone),
      parseNullableString(row.address),
      parseNullableString(row.insuranceProvider),
      parseNullableString(row.insurancePolicyNumber),
      parseNullableString(row.medicalHistory),
      parseNullableString(row.allergies),
      parseNullableString(row.medications),
      parseNullableString(row.emergencyContactName),
      parseNullableString(row.emergencyContactPhone),
      parseNullableBool(row.isActive) ?? true,
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
  return result.rows[0].id;
}

async function insertNote(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  patientIdMap: Map<number, number>,
  templateIdMap: Map<number, number>
) {
  const mappedPatientId =
    row.patientId == null ? null : patientIdMap.get(Number(row.patientId)) ?? null;
  const mappedTemplateId =
    row.templateId == null ? null : templateIdMap.get(Number(row.templateId)) ?? null;

  const result = await client.query<{ id: number }>(
    `insert into notes (
      user_id, patient_id, title, patient_name, specialty, subjective, objective,
      assessment, plan, transcript, patient_context, patient_instructions,
      template_id, icd_codes, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    returning id`,
    [
      targetUserId,
      mappedPatientId,
      parseNullableString(row.title) ?? "Imported Note",
      parseNullableString(row.patientName),
      parseNullableString(row.specialty),
      parseNullableString(row.subjective),
      parseNullableString(row.objective),
      parseNullableString(row.assessment),
      parseNullableString(row.plan),
      parseNullableString(row.transcript),
      parseNullableString(row.patientContext),
      parseNullableString(row.patientInstructions),
      mappedTemplateId,
      parseNullableString(row.icdCodes),
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
  return result.rows[0].id;
}

async function insertTask(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  noteIdMap: Map<number, number>
) {
  const mappedNoteId = row.noteId == null ? null : noteIdMap.get(Number(row.noteId)) ?? null;
  await client.query(
    `insert into tasks (
      user_id, note_id, title, patient_name, category, status, due_date, completed_at, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      targetUserId,
      mappedNoteId,
      parseNullableString(row.title) ?? "Imported Task",
      parseNullableString(row.patientName),
      parseNullableString(row.category) ?? "document",
      parseNullableString(row.status) ?? "todo",
      parseJsonDate(row.dueDate),
      parseJsonDate(row.completedAt),
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
}

async function insertAppointment(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  targetPracticeId: number | null,
  patientIdMap: Map<number, number>
) {
  const mappedPatientId = patientIdMap.get(Number(row.patientId));
  if (!mappedPatientId) {
    throw new Error(`Missing mapped patient for appointment source patient ${row.patientId}`);
  }

  const mappedOrganizationId = row.organizationId == null ? null : targetPracticeId;
  const result = await client.query<{ id: number }>(
    `insert into appointments (
      user_id, organization_id, patient_id, title, description, start_time, end_time,
      status, appointment_type, location, notes, reminder_sent, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    returning id`,
    [
      targetUserId,
      mappedOrganizationId,
      mappedPatientId,
      parseNullableString(row.title) ?? "Imported Appointment",
      parseNullableString(row.description),
      parseJsonDate(row.startTime) ?? new Date(),
      parseJsonDate(row.endTime) ?? new Date(),
      parseNullableString(row.status) ?? "scheduled",
      parseNullableString(row.appointmentType) ?? "general",
      parseNullableString(row.location),
      parseNullableString(row.notes),
      parseNullableBool(row.reminderSent) ?? false,
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
  return result.rows[0].id;
}

async function insertVitals(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  targetPracticeId: number | null,
  patientIdMap: Map<number, number>
) {
  const mappedPatientId = patientIdMap.get(Number(row.patientId));
  if (!mappedPatientId) {
    throw new Error(`Missing mapped patient for vitals source patient ${row.patientId}`);
  }

  const mappedOrganizationId = row.organizationId == null ? null : targetPracticeId;
  await client.query(
    `insert into patient_vitals (
      patient_id, organization_id, recorded_by, recorded_at, blood_pressure_systolic,
      blood_pressure_diastolic, heart_rate, respiratory_rate, temperature, temperature_unit,
      oxygen_saturation, weight, weight_unit, height, height_unit, bmi, pain_level,
      pain_location, blood_glucose, notes, created_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      mappedPatientId,
      mappedOrganizationId,
      targetUserId,
      parseJsonDate(row.recordedAt) ?? new Date(),
      parseNullableInt(row.bloodPressureSystolic),
      parseNullableInt(row.bloodPressureDiastolic),
      parseNullableInt(row.heartRate),
      parseNullableInt(row.respiratoryRate),
      parseNullableString(row.temperature),
      parseNullableString(row.temperatureUnit) ?? "F",
      parseNullableInt(row.oxygenSaturation),
      parseNullableString(row.weight),
      parseNullableString(row.weightUnit) ?? "lbs",
      parseNullableString(row.height),
      parseNullableString(row.heightUnit) ?? "in",
      parseNullableString(row.bmi),
      parseNullableInt(row.painLevel),
      parseNullableString(row.painLocation),
      parseNullableInt(row.bloodGlucose),
      parseNullableString(row.notes),
      parseJsonDate(row.createdAt) ?? new Date(),
    ]
  );
}

async function insertEncounter(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  targetPracticeId: number | null,
  patientIdMap: Map<number, number>,
  noteIdMap: Map<number, number>,
  appointmentIdMap: Map<number, number>
) {
  const mappedPatientId = patientIdMap.get(Number(row.patientId));
  if (!mappedPatientId) {
    throw new Error(`Missing mapped patient for encounter source patient ${row.patientId}`);
  }

  const mappedOrganizationId = row.organizationId == null ? null : targetPracticeId;
  const mappedAppointmentId =
    row.appointmentId == null ? null : appointmentIdMap.get(Number(row.appointmentId)) ?? null;
  const mappedNoteId =
    row.noteId == null ? null : noteIdMap.get(Number(row.noteId)) ?? null;

  await client.query(
    `insert into patient_encounters (
      patient_id, organization_id, provider_id, appointment_id, note_id, encounter_date,
      encounter_type, chief_complaint, hpi_onset, hpi_location, hpi_duration, hpi_character,
      hpi_aggravating, hpi_relieving, hpi_timing, hpi_severity, hpi_associated_symptoms,
      hpi_context, hpi_narrative, ros_constitutional, ros_eyes, ros_ent, ros_cardiovascular,
      ros_respiratory, ros_gi, ros_gu, ros_musculoskeletal, ros_skin, ros_neurological,
      ros_psychiatric, ros_endocrine, ros_hematologic, ros_allergic, pe_general, pe_vitals,
      pe_head, pe_eyes, pe_ent, pe_neck, pe_chest, pe_lungs, pe_heart, pe_abdomen, pe_back,
      pe_extremities, pe_skin, pe_neurological, pe_psychiatric, ros_checklist, pe_checklist,
      diagnosis_codes, procedure_codes, medications, assessment_summary, plan_summary, status,
      signed_at, signed_by, requires_cosignature, cosigned_at, cosigned_by, cosignature_notes,
      created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
      $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
      $61,$62,$63,$64
    )`,
    [
      mappedPatientId,
      mappedOrganizationId,
      targetUserId,
      mappedAppointmentId,
      mappedNoteId,
      parseJsonDate(row.encounterDate) ?? new Date(),
      parseNullableString(row.encounterType) ?? "office_visit",
      parseNullableString(row.chiefComplaint),
      parseNullableString(row.hpiOnset),
      parseNullableString(row.hpiLocation),
      parseNullableString(row.hpiDuration),
      parseNullableString(row.hpiCharacter),
      parseNullableString(row.hpiAggravating),
      parseNullableString(row.hpiRelieving),
      parseNullableString(row.hpiTiming),
      parseNullableString(row.hpiSeverity),
      parseNullableString(row.hpiAssociatedSymptoms),
      parseNullableString(row.hpiContext),
      parseNullableString(row.hpiNarrative),
      parseNullableString(row.rosConstitutional),
      parseNullableString(row.rosEyes),
      parseNullableString(row.rosEnt),
      parseNullableString(row.rosCardiovascular),
      parseNullableString(row.rosRespiratory),
      parseNullableString(row.rosGastrointestinal),
      parseNullableString(row.rosGenitourinary),
      parseNullableString(row.rosMusculoskeletal),
      parseNullableString(row.rosSkin),
      parseNullableString(row.rosNeurological),
      parseNullableString(row.rosPsychiatric),
      parseNullableString(row.rosEndocrine),
      parseNullableString(row.rosHematologic),
      parseNullableString(row.rosAllergic),
      parseNullableString(row.peGeneral),
      parseNullableString(row.peVitals),
      parseNullableString(row.peHead),
      parseNullableString(row.peEyes),
      parseNullableString(row.peEnt),
      parseNullableString(row.peNeck),
      parseNullableString(row.peChest),
      parseNullableString(row.peLungs),
      parseNullableString(row.peHeart),
      parseNullableString(row.peAbdomen),
      parseNullableString(row.peBack),
      parseNullableString(row.peExtremities),
      parseNullableString(row.peSkin),
      parseNullableString(row.peNeurological),
      parseNullableString(row.pePsychiatric),
      parseNullableString(row.rosChecklist),
      parseNullableString(row.peChecklist),
      parseNullableString(row.diagnosisCodes),
      parseNullableString(row.procedureCodes),
      parseNullableString(row.medications),
      parseNullableString(row.assessmentSummary),
      parseNullableString(row.planSummary),
      parseNullableString(row.status) ?? "in_progress",
      parseJsonDate(row.signedAt),
      row.signedBy == null ? null : targetUserId,
      parseNullableBool(row.requiresCosignature) ?? false,
      parseJsonDate(row.cosignedAt),
      row.cosignedBy == null ? null : targetUserId,
      parseNullableString(row.cosignatureNotes),
      parseJsonDate(row.createdAt) ?? new Date(),
      parseJsonDate(row.updatedAt) ?? new Date(),
    ]
  );
}

async function insertDocument(
  client: pg.Client,
  row: Record<string, unknown>,
  targetUserId: string,
  targetPracticeId: number | null,
  patientIdMap: Map<number, number>
) {
  const mappedPatientId = patientIdMap.get(Number(row.patientId));
  if (!mappedPatientId) {
    throw new Error(`Missing mapped patient for document source patient ${row.patientId}`);
  }

  const mappedOrganizationId = row.organizationId == null ? null : targetPracticeId;
  await client.query(
    `insert into patient_documents (
      user_id, organization_id, patient_id, file_name, file_type, file_size, file_url,
      document_type, description, uploaded_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      targetUserId,
      mappedOrganizationId,
      mappedPatientId,
      parseNullableString(row.fileName) ?? "Imported Document",
      parseNullableString(row.fileType) ?? "application/octet-stream",
      parseNullableInt(row.fileSize),
      parseNullableString(row.fileUrl) ?? "",
      parseNullableString(row.documentType) ?? "other",
      parseNullableString(row.description),
      parseJsonDate(row.uploadedAt) ?? new Date(),
    ]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = requireEnv("DATABASE_URL");

  const payload = JSON.parse(fs.readFileSync(args.file, "utf8")) as BackupPayload;
  const sourceUserId = String(payload.account.userId);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureTargetUser(client, args.targetUserId);
    const practiceIds = await getOwnedPracticeIds(client, args.targetUserId);
    const targetPracticeId = chooseDefaultPracticeId(practiceIds, args.targetPracticeId);

    await maybeAbortOnPriorImport(client, sourceUserId, args.targetUserId, args.force);

    await client.query("begin");

    const templateIdMap = new Map<number, number>();
    for (const template of payload.scribe.templates) {
      const sourceTemplateId = Number(template.id);
      const insertedId = await insertTemplate(client, template, sourceUserId, args.targetUserId);
      templateIdMap.set(sourceTemplateId, insertedId);
    }

    const mappedDefaultTemplateId =
      payload.account.settings?.defaultTemplateId == null
        ? null
        : templateIdMap.get(Number(payload.account.settings.defaultTemplateId)) ?? null;

    await upsertUserSettings(client, args.targetUserId, payload.account.settings, mappedDefaultTemplateId);
    await upsertSubscription(client, args.targetUserId, payload.account.subscription);
    await maybeRenamePractice(
      client,
      targetPracticeId,
      parseNullableString(payload.account.settings?.practiceName)
    );

    const patientIdMap = new Map<number, number>();
    for (const patient of payload.emr.patients) {
      const sourcePatientId = Number(patient.id);
      const insertedId = await insertPatient(client, patient, args.targetUserId, targetPracticeId);
      patientIdMap.set(sourcePatientId, insertedId);
    }

    const noteIdMap = new Map<number, number>();
    for (const note of payload.scribe.notes) {
      const sourceNoteId = Number(note.id);
      const insertedId = await insertNote(client, note, args.targetUserId, patientIdMap, templateIdMap);
      noteIdMap.set(sourceNoteId, insertedId);
    }

    for (const task of payload.scribe.tasks) {
      await insertTask(client, task, args.targetUserId, noteIdMap);
    }

    const appointmentIdMap = new Map<number, number>();
    for (const appointment of payload.emr.appointments) {
      const sourceAppointmentId = Number(appointment.id);
      const insertedId = await insertAppointment(
        client,
        appointment,
        args.targetUserId,
        targetPracticeId,
        patientIdMap
      );
      appointmentIdMap.set(sourceAppointmentId, insertedId);
    }

    for (const vitals of payload.emr.vitals) {
      await insertVitals(client, vitals, args.targetUserId, targetPracticeId, patientIdMap);
    }

    for (const encounter of payload.emr.encounters) {
      await insertEncounter(
        client,
        encounter,
        args.targetUserId,
        targetPracticeId,
        patientIdMap,
        noteIdMap,
        appointmentIdMap
      );
    }

    for (const document of payload.emr.documents) {
      await insertDocument(client, document, args.targetUserId, targetPracticeId, patientIdMap);
    }

    await client.query(
      `insert into audit_logs (
        user_id, user_email, organization_id, action, resource_type, details, timestamp
      ) values ($1,$2,$3,'import','backup',$4,now())`,
      [
        args.targetUserId,
        payload.account.email,
        targetPracticeId,
        JSON.stringify({
          sourceUserId,
          sourceEmail: payload.account.email,
          importedAt: new Date().toISOString(),
          backupExportedAt: payload.exportedAt,
          file: args.file,
          counts: {
            notes: payload.scribe.notes.length,
            templates: payload.scribe.templates.length,
            tasks: payload.scribe.tasks.length,
            patients: payload.emr.patients.length,
            appointments: payload.emr.appointments.length,
            encounters: payload.emr.encounters.length,
            vitals: payload.emr.vitals.length,
            documents: payload.emr.documents.length,
          },
        }),
      ]
    );

    await client.query("commit");

    const summary = {
      importedIntoUserId: args.targetUserId,
      sourceUserId,
      targetPracticeId,
      counts: {
        notes: payload.scribe.notes.length,
        templates: payload.scribe.templates.length,
        tasks: payload.scribe.tasks.length,
        patients: payload.emr.patients.length,
        appointments: payload.emr.appointments.length,
        encounters: payload.emr.encounters.length,
        vitals: payload.emr.vitals.length,
        documents: payload.emr.documents.length,
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback failure
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
