import { Router, type Request, type Response, type NextFunction } from "express";
import type { Patient, PatientEncounter, PatientVitals } from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { getAdminAccessContext } from "./adminAccess";
import { storage } from "./storage";

type FhirAccessContext = {
  userId: string;
  userEmail: string | null;
  isVendorOwner: boolean;
  hasIndividualAccess: boolean;
  organizationIds: number[];
};

type FhirRequest = Request & {
  user?: any;
  fhirAccess?: FhirAccessContext;
};

const router = Router();

const sendFhir = (res: Response, status: number, payload: unknown) => {
  res.status(status);
  res.setHeader("Content-Type", "application/fhir+json; charset=utf-8");
  res.send(payload);
};

const operationOutcome = (
  status: number,
  code: string,
  diagnostics: string,
  severity: "fatal" | "error" | "warning" | "information" = "error",
) => ({
  resourceType: "OperationOutcome",
  issue: [
    {
      severity,
      code,
      diagnostics,
    },
  ],
  status,
});

const parsePositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

const parseString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parsePatientReference = (value: unknown): number | undefined => {
  const raw = parseString(value);
  if (!raw) return undefined;
  const normalized = raw.startsWith("Patient/") ? raw.slice("Patient/".length) : raw;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const toFhirDate = (value: Date | null | undefined): string | undefined => {
  if (!value) return undefined;
  return value.toISOString().slice(0, 10);
};

const toFhirGender = (gender: string | null | undefined): "male" | "female" | "other" | "unknown" => {
  if (!gender) return "unknown";
  if (gender === "male" || gender === "female" || gender === "other") return gender;
  return "unknown";
};

const getBaseUrl = (req: Request): string => `${req.protocol}://${req.get("host")}/api/fhir/r4`;

const numberFromText = (value: string | null | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeEncounterStatus = (status: string | null | undefined): string => {
  if (!status) return "unknown";
  if (status === "in_progress") return "in-progress";
  if (status === "completed" || status === "signed") return "finished";
  if (status === "pending_cosign") return "onhold";
  return "unknown";
};

const patientToFhir = (patient: Patient, req: Request) => {
  const telecom: Array<{ system: "phone" | "email"; value: string; use: "home" }> = [];
  if (patient.phone) telecom.push({ system: "phone", value: patient.phone, use: "home" });
  if (patient.email) telecom.push({ system: "email", value: patient.email, use: "home" });

  const address = patient.address
    ? [
        {
          text: patient.address,
        },
      ]
    : undefined;

  const resource: Record<string, unknown> = {
    resourceType: "Patient",
    id: String(patient.id),
    meta: {
      lastUpdated: (patient.updatedAt ?? patient.createdAt).toISOString(),
      profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"],
    },
    identifier: [
      {
        system: `${getBaseUrl(req)}/identifier/internal-patient-id`,
        value: String(patient.id),
      },
    ],
    active: patient.isActive ?? true,
    name: [
      {
        use: "official",
        family: patient.lastName,
        given: [patient.firstName],
      },
    ],
    gender: toFhirGender(patient.gender),
  };

  const birthDate = toFhirDate(patient.dateOfBirth);
  if (birthDate) resource.birthDate = birthDate;
  if (telecom.length > 0) resource.telecom = telecom;
  if (address) resource.address = address;

  return resource;
};

const encounterToFhir = (encounter: PatientEncounter, req: Request) => {
  const resource: Record<string, unknown> = {
    resourceType: "Encounter",
    id: String(encounter.id),
    status: normalizeEncounterStatus(encounter.status),
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
      display: "ambulatory",
    },
    subject: {
      reference: `Patient/${encounter.patientId}`,
    },
    period: {
      start: encounter.encounterDate.toISOString(),
    },
    meta: {
      lastUpdated: (encounter.updatedAt ?? encounter.createdAt).toISOString(),
    },
  };

  if (encounter.signedAt) {
    resource.period = {
      ...(resource.period as Record<string, unknown>),
      end: encounter.signedAt.toISOString(),
    };
  }

  if (encounter.encounterType) {
    resource.type = [
      {
        text: encounter.encounterType,
      },
    ];
  }

  if (encounter.chiefComplaint) {
    resource.reasonCode = [{ text: encounter.chiefComplaint }];
  }

  resource.serviceProvider = {
    reference: `${getBaseUrl(req)}/Organization/internal-${encounter.organizationId ?? "personal"}`,
  };

  return resource;
};

const vitalsToFhirObservation = (vitals: PatientVitals): Record<string, unknown> => {
  const components: Array<Record<string, unknown>> = [];

  if (typeof vitals.bloodPressureSystolic === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" }],
      },
      valueQuantity: {
        value: vitals.bloodPressureSystolic,
        unit: "mmHg",
        system: "http://unitsofmeasure.org",
        code: "mm[Hg]",
      },
    });
  }

  if (typeof vitals.bloodPressureDiastolic === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }],
      },
      valueQuantity: {
        value: vitals.bloodPressureDiastolic,
        unit: "mmHg",
        system: "http://unitsofmeasure.org",
        code: "mm[Hg]",
      },
    });
  }

  if (typeof vitals.heartRate === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
      },
      valueQuantity: {
        value: vitals.heartRate,
        unit: "beats/minute",
        system: "http://unitsofmeasure.org",
        code: "/min",
      },
    });
  }

  if (typeof vitals.respiratoryRate === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "9279-1", display: "Respiratory rate" }],
      },
      valueQuantity: {
        value: vitals.respiratoryRate,
        unit: "breaths/minute",
        system: "http://unitsofmeasure.org",
        code: "/min",
      },
    });
  }

  if (typeof vitals.oxygenSaturation === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "59408-5", display: "Oxygen saturation in Arterial blood by Pulse oximetry" }],
      },
      valueQuantity: {
        value: vitals.oxygenSaturation,
        unit: "%",
        system: "http://unitsofmeasure.org",
        code: "%",
      },
    });
  }

  const temperatureValue = numberFromText(vitals.temperature);
  if (typeof temperatureValue === "number") {
    const temperatureUnit = vitals.temperatureUnit === "C" ? "Cel" : "[degF]";
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "8310-5", display: "Body temperature" }],
      },
      valueQuantity: {
        value: temperatureValue,
        unit: vitals.temperatureUnit ?? "F",
        system: "http://unitsofmeasure.org",
        code: temperatureUnit,
      },
    });
  }

  const weightValue = numberFromText(vitals.weight);
  if (typeof weightValue === "number") {
    const weightUnit = vitals.weightUnit === "kg" ? "kg" : "[lb_av]";
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body weight" }],
      },
      valueQuantity: {
        value: weightValue,
        unit: vitals.weightUnit ?? "lbs",
        system: "http://unitsofmeasure.org",
        code: weightUnit,
      },
    });
  }

  const heightValue = numberFromText(vitals.height);
  if (typeof heightValue === "number") {
    const heightUnit = vitals.heightUnit === "cm" ? "cm" : "[in_i]";
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "8302-2", display: "Body height" }],
      },
      valueQuantity: {
        value: heightValue,
        unit: vitals.heightUnit ?? "in",
        system: "http://unitsofmeasure.org",
        code: heightUnit,
      },
    });
  }

  const bmiValue = numberFromText(vitals.bmi);
  if (typeof bmiValue === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "39156-5", display: "Body mass index (BMI) [Ratio]" }],
      },
      valueQuantity: {
        value: bmiValue,
        unit: "kg/m2",
        system: "http://unitsofmeasure.org",
        code: "kg/m2",
      },
    });
  }

  if (typeof vitals.bloodGlucose === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "2339-0", display: "Glucose [Mass/volume] in Blood" }],
      },
      valueQuantity: {
        value: vitals.bloodGlucose,
        unit: "mg/dL",
        system: "http://unitsofmeasure.org",
        code: "mg/dL",
      },
    });
  }

  if (typeof vitals.painLevel === "number") {
    components.push({
      code: {
        coding: [{ system: "http://loinc.org", code: "72514-3", display: "Pain severity - 0-10 verbal numeric rating [Score]" }],
      },
      valueInteger: vitals.painLevel,
    });
  }

  const resource: Record<string, unknown> = {
    resourceType: "Observation",
    id: String(vitals.id),
    status: "final",
    category: [
      {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }],
      },
    ],
    code: {
      coding: [{ system: "http://loinc.org", code: "85353-1", display: "Vital signs panel with all children optional" }],
      text: "Vital signs panel",
    },
    subject: {
      reference: `Patient/${vitals.patientId}`,
    },
    effectiveDateTime: vitals.recordedAt.toISOString(),
    issued: vitals.createdAt.toISOString(),
  };

  if (components.length > 0) {
    resource.component = components;
  }

  if (vitals.notes) {
    resource.note = [{ text: vitals.notes }];
  }

  return resource;
};

const canAccessPatient = (patient: Patient, access: FhirAccessContext): boolean => {
  if (access.isVendorOwner) return true;
  if (patient.userId === access.userId) return true;
  if (patient.organizationId && access.organizationIds.includes(patient.organizationId)) return true;
  return false;
};

const dedupePatients = (patients: Patient[]): Patient[] => {
  const byId = new Map<number, Patient>();
  for (const patient of patients) {
    byId.set(patient.id, patient);
  }
  return Array.from(byId.values());
};

const getAccessiblePatients = async (
  access: FhirAccessContext,
  requestedOrganizationId?: number,
): Promise<Patient[]> => {
  if (typeof requestedOrganizationId === "number") {
    if (!access.isVendorOwner && !access.organizationIds.includes(requestedOrganizationId)) {
      return [];
    }
    return storage.getPatientsByOrganization(requestedOrganizationId);
  }

  const ownPatientsPromise = storage.getPatientsByUser(access.userId);
  const orgPatientsPromise = Promise.all(
    access.organizationIds.map((organizationId) => storage.getPatientsByOrganization(organizationId)),
  );

  const [ownPatients, orgPatientLists] = await Promise.all([ownPatientsPromise, orgPatientsPromise]);
  return dedupePatients([...ownPatients, ...orgPatientLists.flat()]);
};

router.use(isAuthenticated);

router.use(async (req: FhirRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email ?? null;
    if (!userId) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const adminAccess = await getAdminAccessContext(req);
    const isVendorOwner = adminAccess.isAdmin;

    const subscription = await storage.getSubscription(userId);
    const hasIndividualAccess = subscription?.status === "active" && subscription?.hasEmrAccess === true;
    const emrOrganizations = await storage.getUserEmrOrganizations(userId);
    const organizationIds = emrOrganizations.map((entry) => entry.practice.id);

    if (!isVendorOwner && !hasIndividualAccess && organizationIds.length === 0) {
      return sendFhir(
        res,
        403,
        operationOutcome(403, "forbidden", "EMR access is not enabled for this account."),
      );
    }

    req.fhirAccess = {
      userId,
      userEmail,
      isVendorOwner,
      hasIndividualAccess,
      organizationIds,
    };
    return next();
  } catch (error) {
    console.error("FHIR access check failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to verify FHIR access."));
  }
});

router.get("/metadata", (req: FhirRequest, res: Response) => {
  const baseUrl = getBaseUrl(req);
  const capabilityStatement = {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["application/fhir+json", "json"],
    software: {
      name: "DocuWhisper",
      version: "1.0.0",
    },
    implementation: {
      description: "DocuWhisper FHIR R4 API (foundation profile).",
      url: baseUrl,
    },
    rest: [
      {
        mode: "server",
        resource: [
          {
            type: "Patient",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [
              { name: "_id", type: "token" },
              { name: "family", type: "string" },
              { name: "given", type: "string" },
              { name: "name", type: "string" },
              { name: "birthdate", type: "date" },
            ],
          },
          {
            type: "Encounter",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [{ name: "patient", type: "reference" }],
          },
          {
            type: "Observation",
            interaction: [{ code: "search-type" }],
            searchParam: [{ name: "patient", type: "reference" }, { name: "category", type: "token" }],
          },
        ],
      },
    ],
  };
  return sendFhir(res, 200, capabilityStatement);
});

router.get("/Patient/:id", async (req: FhirRequest, res: Response) => {
  try {
    const access = req.fhirAccess;
    if (!access) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const patientIdParam = parseString(req.params.id);
    const patientId = Number.parseInt(patientIdParam ?? "", 10);
    if (!Number.isFinite(patientId) || patientId <= 0) {
      return sendFhir(res, 400, operationOutcome(400, "invalid", "Patient id must be a positive integer."));
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return sendFhir(res, 404, operationOutcome(404, "not-found", "Patient not found."));
    }

    if (!canAccessPatient(patient, access)) {
      return sendFhir(res, 403, operationOutcome(403, "forbidden", "Access denied for this patient."));
    }

    return sendFhir(res, 200, patientToFhir(patient, req));
  } catch (error) {
    console.error("FHIR Patient read failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to fetch patient."));
  }
});

router.get("/Patient", async (req: FhirRequest, res: Response) => {
  try {
    const access = req.fhirAccess;
    if (!access) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const countRaw = parsePositiveInt(req.query._count);
    const offsetRaw = parsePositiveInt(req.query._offset);
    const count = typeof countRaw === "number" ? Math.min(Math.max(countRaw, 1), 100) : 20;
    const offset = typeof offsetRaw === "number" ? offsetRaw : 0;

    const organizationIdRaw = parseString(req.query.organizationId);
    let organizationId: number | undefined;
    if (organizationIdRaw) {
      const parsed = Number.parseInt(organizationIdRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return sendFhir(
          res,
          400,
          operationOutcome(400, "invalid", "organizationId must be a positive integer when provided."),
        );
      }
      organizationId = parsed;
      if (!access.isVendorOwner && !access.organizationIds.includes(parsed)) {
        return sendFhir(
          res,
          403,
          operationOutcome(403, "forbidden", "Access denied to requested organization."),
        );
      }
    }

    const allPatients = await getAccessiblePatients(access, organizationId);

    const idFilter = parseString(req.query._id);
    const familyFilter = parseString(req.query.family)?.toLowerCase();
    const givenFilter = parseString(req.query.given)?.toLowerCase();
    const nameFilter = parseString(req.query.name)?.toLowerCase();
    const birthdateFilter = parseString(req.query.birthdate);
    const identifierFilter = parseString(req.query.identifier);

    let filtered = allPatients.filter((patient) => canAccessPatient(patient, access));

    if (idFilter) {
      filtered = filtered.filter((patient) => String(patient.id) === idFilter);
    }
    if (identifierFilter) {
      filtered = filtered.filter((patient) => String(patient.id) === identifierFilter);
    }
    if (familyFilter) {
      filtered = filtered.filter((patient) => patient.lastName.toLowerCase().includes(familyFilter));
    }
    if (givenFilter) {
      filtered = filtered.filter((patient) => patient.firstName.toLowerCase().includes(givenFilter));
    }
    if (nameFilter) {
      filtered = filtered.filter((patient) => {
        const full = `${patient.firstName} ${patient.lastName}`.toLowerCase();
        return full.includes(nameFilter) || patient.firstName.toLowerCase().includes(nameFilter) || patient.lastName.toLowerCase().includes(nameFilter);
      });
    }
    if (birthdateFilter) {
      filtered = filtered.filter((patient) => toFhirDate(patient.dateOfBirth) === birthdateFilter);
    }

    filtered.sort((a, b) => {
      const lastCmp = a.lastName.localeCompare(b.lastName);
      if (lastCmp !== 0) return lastCmp;
      const firstCmp = a.firstName.localeCompare(b.firstName);
      if (firstCmp !== 0) return firstCmp;
      return a.id - b.id;
    });

    const total = filtered.length;
    const page = filtered.slice(offset, offset + count);
    const baseUrl = getBaseUrl(req);
    const selfUrl = new URL(`${baseUrl}/Patient`);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        selfUrl.searchParams.set(key, value);
      }
    }
    selfUrl.searchParams.set("_count", String(count));
    selfUrl.searchParams.set("_offset", String(offset));

    const bundle: Record<string, unknown> = {
      resourceType: "Bundle",
      type: "searchset",
      total,
      link: [{ relation: "self", url: selfUrl.toString() }],
      entry: page.map((patient) => ({
        fullUrl: `${baseUrl}/Patient/${patient.id}`,
        resource: patientToFhir(patient, req),
        search: { mode: "match" },
      })),
    };

    if (offset + count < total) {
      const nextUrl = new URL(selfUrl.toString());
      nextUrl.searchParams.set("_offset", String(offset + count));
      const links = bundle.link as Array<{ relation: string; url: string }>;
      links.push({ relation: "next", url: nextUrl.toString() });
    }

    return sendFhir(res, 200, bundle);
  } catch (error) {
    console.error("FHIR Patient search failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to search patients."));
  }
});

router.get("/Encounter/:id", async (req: FhirRequest, res: Response) => {
  try {
    const access = req.fhirAccess;
    if (!access) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const encounterIdRaw = parseString(req.params.id);
    const encounterId = Number.parseInt(encounterIdRaw ?? "", 10);
    if (!Number.isFinite(encounterId) || encounterId <= 0) {
      return sendFhir(res, 400, operationOutcome(400, "invalid", "Encounter id must be a positive integer."));
    }

    const encounter = await storage.getEncounter(encounterId);
    if (!encounter) {
      return sendFhir(res, 404, operationOutcome(404, "not-found", "Encounter not found."));
    }

    const patient = await storage.getPatient(encounter.patientId);
    if (!patient) {
      return sendFhir(res, 404, operationOutcome(404, "not-found", "Patient not found for encounter."));
    }

    if (!canAccessPatient(patient, access)) {
      return sendFhir(res, 403, operationOutcome(403, "forbidden", "Access denied for this encounter."));
    }

    return sendFhir(res, 200, encounterToFhir(encounter, req));
  } catch (error) {
    console.error("FHIR Encounter read failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to fetch encounter."));
  }
});

router.get("/Encounter", async (req: FhirRequest, res: Response) => {
  try {
    const access = req.fhirAccess;
    if (!access) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const patientId = parsePatientReference(req.query.patient);
    if (!patientId) {
      return sendFhir(
        res,
        400,
        operationOutcome(400, "required", "patient search parameter is required (e.g., patient=Patient/123)."),
      );
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return sendFhir(res, 404, operationOutcome(404, "not-found", "Patient not found."));
    }
    if (!canAccessPatient(patient, access)) {
      return sendFhir(res, 403, operationOutcome(403, "forbidden", "Access denied for this patient."));
    }

    const countRaw = parsePositiveInt(req.query._count);
    const offsetRaw = parsePositiveInt(req.query._offset);
    const count = typeof countRaw === "number" ? Math.min(Math.max(countRaw, 1), 100) : 20;
    const offset = typeof offsetRaw === "number" ? offsetRaw : 0;

    const encounters = await storage.getEncountersByPatient(patientId);
    const total = encounters.length;
    const page = encounters.slice(offset, offset + count);
    const baseUrl = getBaseUrl(req);
    const selfUrl = new URL(`${baseUrl}/Encounter`);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        selfUrl.searchParams.set(key, value);
      }
    }
    selfUrl.searchParams.set("_count", String(count));
    selfUrl.searchParams.set("_offset", String(offset));

    const bundle: Record<string, unknown> = {
      resourceType: "Bundle",
      type: "searchset",
      total,
      link: [{ relation: "self", url: selfUrl.toString() }],
      entry: page.map((encounter) => ({
        fullUrl: `${baseUrl}/Encounter/${encounter.id}`,
        resource: encounterToFhir(encounter, req),
        search: { mode: "match" },
      })),
    };

    if (offset + count < total) {
      const nextUrl = new URL(selfUrl.toString());
      nextUrl.searchParams.set("_offset", String(offset + count));
      const links = bundle.link as Array<{ relation: string; url: string }>;
      links.push({ relation: "next", url: nextUrl.toString() });
    }

    return sendFhir(res, 200, bundle);
  } catch (error) {
    console.error("FHIR Encounter search failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to search encounters."));
  }
});

router.get("/Observation", async (req: FhirRequest, res: Response) => {
  try {
    const access = req.fhirAccess;
    if (!access) {
      return sendFhir(res, 401, operationOutcome(401, "login", "Unauthorized."));
    }

    const patientId = parsePatientReference(req.query.patient);
    if (!patientId) {
      return sendFhir(
        res,
        400,
        operationOutcome(400, "required", "patient search parameter is required (e.g., patient=Patient/123)."),
      );
    }

    const category = parseString(req.query.category)?.toLowerCase();
    if (category && category !== "vital-signs") {
      const emptyBundle = {
        resourceType: "Bundle",
        type: "searchset",
        total: 0,
        entry: [],
      };
      return sendFhir(res, 200, emptyBundle);
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return sendFhir(res, 404, operationOutcome(404, "not-found", "Patient not found."));
    }
    if (!canAccessPatient(patient, access)) {
      return sendFhir(res, 403, operationOutcome(403, "forbidden", "Access denied for this patient."));
    }

    const countRaw = parsePositiveInt(req.query._count);
    const offsetRaw = parsePositiveInt(req.query._offset);
    const count = typeof countRaw === "number" ? Math.min(Math.max(countRaw, 1), 100) : 20;
    const offset = typeof offsetRaw === "number" ? offsetRaw : 0;

    const vitals = await storage.getVitalsByPatient(patientId);
    const total = vitals.length;
    const page = vitals.slice(offset, offset + count);
    const baseUrl = getBaseUrl(req);
    const selfUrl = new URL(`${baseUrl}/Observation`);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") {
        selfUrl.searchParams.set(key, value);
      }
    }
    selfUrl.searchParams.set("_count", String(count));
    selfUrl.searchParams.set("_offset", String(offset));

    const bundle: Record<string, unknown> = {
      resourceType: "Bundle",
      type: "searchset",
      total,
      link: [{ relation: "self", url: selfUrl.toString() }],
      entry: page.map((vital) => ({
        fullUrl: `${baseUrl}/Observation/${vital.id}`,
        resource: vitalsToFhirObservation(vital),
        search: { mode: "match" },
      })),
    };

    if (offset + count < total) {
      const nextUrl = new URL(selfUrl.toString());
      nextUrl.searchParams.set("_offset", String(offset + count));
      const links = bundle.link as Array<{ relation: string; url: string }>;
      links.push({ relation: "next", url: nextUrl.toString() });
    }

    return sendFhir(res, 200, bundle);
  } catch (error) {
    console.error("FHIR Observation search failed:", error);
    return sendFhir(res, 500, operationOutcome(500, "exception", "Failed to search observations."));
  }
});

export default router;
