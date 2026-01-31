import { Router, Request, Response } from "express";
import { externalApiAuth, requireScope } from "./externalApiMiddleware";
import { storage } from "./storage";
import { z } from "zod";

const router = Router();

router.use(externalApiAuth);

const SearchPatientsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

router.get("/patients", requireScope("patients:read"), async (req: Request, res: Response) => {
  try {
    const query = SearchPatientsSchema.parse({
      firstName: typeof req.query.firstName === 'string' ? req.query.firstName : undefined,
      lastName: typeof req.query.lastName === 'string' ? req.query.lastName : undefined,
      dateOfBirth: typeof req.query.dateOfBirth === 'string' ? req.query.dateOfBirth : undefined,
      email: typeof req.query.email === 'string' ? req.query.email : undefined,
      phone: typeof req.query.phone === 'string' ? req.query.phone : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    });
    
    const allPatients = await storage.getPatientsByOrganization(req.apiPractice!.id);
    
    let filtered = allPatients;
    
    if (query.firstName) {
      filtered = filtered.filter(p => 
        p.firstName.toLowerCase().includes(query.firstName!.toLowerCase())
      );
    }
    if (query.lastName) {
      filtered = filtered.filter(p => 
        p.lastName.toLowerCase().includes(query.lastName!.toLowerCase())
      );
    }
    if (query.dateOfBirth) {
      const searchDate = new Date(query.dateOfBirth);
      filtered = filtered.filter(p => {
        if (!p.dateOfBirth) return false;
        const patientDob = new Date(p.dateOfBirth);
        return patientDob.toDateString() === searchDate.toDateString();
      });
    }
    if (query.email) {
      filtered = filtered.filter(p => 
        p.email?.toLowerCase() === query.email!.toLowerCase()
      );
    }
    if (query.phone) {
      filtered = filtered.filter(p => p.phone?.includes(query.phone!));
    }
    
    const total = filtered.length;
    const paginated = filtered.slice(query.offset, query.offset + query.limit);
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "search",
      resourceType: "patient",
      details: JSON.stringify({ query, resultCount: paginated.length }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: paginated.map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        email: p.email,
        phone: p.phone,
        address: p.address,
        createdAt: p.createdAt,
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid query parameters",
        details: error.errors,
      });
    }
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while searching patients",
    });
  }
});

router.get("/patients/:id", requireScope("patients:read"), async (req: Request, res: Response) => {
  try {
    const patientId = parseInt(req.params.id as string);
    if (isNaN(patientId)) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid patient ID",
      });
    }
    
    const patient = await storage.getPatient(patientId);
    
    if (!patient) {
      return res.status(404).json({
        error: "not_found",
        message: "Patient not found",
      });
    }
    
    if (patient.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Patient belongs to a different organization",
      });
    }
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "view",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: patient,
    });
  } catch (error: any) {
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while fetching patient",
    });
  }
});

const CreatePatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  medicalHistory: z.string().optional(),
});

router.post("/patients", requireScope("patients:write"), async (req: Request, res: Response) => {
  try {
    const data = CreatePatientSchema.parse(req.body);
    
    const patient = await storage.createPatient({
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      emergencyContactName: data.emergencyContactName || null,
      emergencyContactPhone: data.emergencyContactPhone || null,
      insuranceProvider: data.insuranceProvider || null,
      insurancePolicyNumber: data.insurancePolicyNumber || null,
      allergies: data.allergies || null,
      medications: data.medications || null,
      medicalHistory: data.medicalHistory || null,
      userId: `api_key:${req.apiKey!.id}`,
      organizationId: req.apiPractice!.id,
    });
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "create",
      resourceType: "patient",
      resourceId: patient.id,
      patientId: patient.id,
      details: JSON.stringify({ firstName: data.firstName, lastName: data.lastName }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.status(201).json({
      success: true,
      data: patient,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid patient data",
        details: error.errors,
      });
    }
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while creating patient",
    });
  }
});

router.patch("/patients/:id", requireScope("patients:write"), async (req: Request, res: Response) => {
  try {
    const patientId = parseInt(req.params.id as string);
    if (isNaN(patientId)) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid patient ID",
      });
    }
    
    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({
        error: "not_found",
        message: "Patient not found",
      });
    }
    
    if (patient.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Patient belongs to a different organization",
      });
    }
    
    const rawData = CreatePatientSchema.partial().parse(req.body);
    
    const updateData: Record<string, any> = {};
    if (rawData.firstName) updateData.firstName = rawData.firstName;
    if (rawData.lastName) updateData.lastName = rawData.lastName;
    if (rawData.dateOfBirth) updateData.dateOfBirth = new Date(rawData.dateOfBirth);
    if (rawData.gender !== undefined) updateData.gender = rawData.gender || null;
    if (rawData.email !== undefined) updateData.email = rawData.email || null;
    if (rawData.phone !== undefined) updateData.phone = rawData.phone || null;
    if (rawData.address !== undefined) updateData.address = rawData.address || null;
    if (rawData.emergencyContactName !== undefined) updateData.emergencyContactName = rawData.emergencyContactName || null;
    if (rawData.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = rawData.emergencyContactPhone || null;
    if (rawData.insuranceProvider !== undefined) updateData.insuranceProvider = rawData.insuranceProvider || null;
    if (rawData.insurancePolicyNumber !== undefined) updateData.insurancePolicyNumber = rawData.insurancePolicyNumber || null;
    if (rawData.allergies !== undefined) updateData.allergies = rawData.allergies || null;
    if (rawData.medications !== undefined) updateData.medications = rawData.medications || null;
    if (rawData.medicalHistory !== undefined) updateData.medicalHistory = rawData.medicalHistory || null;
    
    const updated = await storage.updatePatient(patientId, updateData);
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "update",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      details: JSON.stringify({ updatedFields: Object.keys(updateData) }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid patient data",
        details: error.errors,
      });
    }
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while updating patient",
    });
  }
});

router.get("/patients/:id/history", requireScope("patients:read", "encounters:read"), async (req: Request, res: Response) => {
  try {
    const patientId = parseInt(req.params.id as string);
    if (isNaN(patientId)) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid patient ID",
      });
    }
    
    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({
        error: "not_found",
        message: "Patient not found",
      });
    }
    
    if (patient.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Patient belongs to a different organization",
      });
    }
    
    const [encounters, vitals, appointments] = await Promise.all([
      storage.getEncountersByPatient(patientId),
      storage.getVitalsByPatient(patientId),
      storage.getAppointmentsByPatient(patientId),
    ]);
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "view",
      resourceType: "patient_history",
      resourceId: patientId,
      patientId,
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: {
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          allergies: patient.allergies,
          medications: patient.medications,
          medicalHistory: patient.medicalHistory,
        },
        encounters: encounters.map(e => ({
          id: e.id,
          encounterDate: e.encounterDate,
          encounterType: e.encounterType,
          chiefComplaint: e.chiefComplaint,
          assessmentSummary: e.assessmentSummary,
          status: e.status,
          createdAt: e.createdAt,
        })),
        vitals: vitals.map(v => ({
          id: v.id,
          recordedAt: v.recordedAt,
          bloodPressureSystolic: v.bloodPressureSystolic,
          bloodPressureDiastolic: v.bloodPressureDiastolic,
          heartRate: v.heartRate,
          temperature: v.temperature,
          respiratoryRate: v.respiratoryRate,
          oxygenSaturation: v.oxygenSaturation,
          weight: v.weight,
          height: v.height,
        })),
        appointments: appointments.slice(0, 10).map(a => ({
          id: a.id,
          startTime: a.startTime,
          endTime: a.endTime,
          appointmentType: a.appointmentType,
          status: a.status,
          title: a.title,
        })),
      },
    });
  } catch (error: any) {
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while fetching patient history",
    });
  }
});

const CreateEncounterSchema = z.object({
  patientId: z.number(),
  encounterDate: z.string(),
  encounterType: z.string().optional(),
  chiefComplaint: z.string().optional(),
  assessmentSummary: z.string().optional(),
  vitals: z.object({
    bloodPressureSystolic: z.number().optional(),
    bloodPressureDiastolic: z.number().optional(),
    heartRate: z.number().optional(),
    temperature: z.string().optional(),
    respiratoryRate: z.number().optional(),
    oxygenSaturation: z.number().optional(),
    weight: z.string().optional(),
    height: z.string().optional(),
    painLevel: z.number().optional(),
  }).optional(),
  rosChecklist: z.string().optional(),
  peChecklist: z.string().optional(),
  diagnosisCodes: z.string().optional(),
  procedureCodes: z.string().optional(),
  medications: z.string().optional(),
});

router.post("/encounters", requireScope("encounters:write"), async (req: Request, res: Response) => {
  try {
    const data = CreateEncounterSchema.parse(req.body);
    
    const patient = await storage.getPatient(data.patientId);
    if (!patient) {
      return res.status(404).json({
        error: "not_found",
        message: "Patient not found",
      });
    }
    
    if (patient.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Patient belongs to a different organization",
      });
    }
    
    if (data.vitals) {
      await storage.createVitals({
        patientId: data.patientId,
        recordedBy: `api_key:${req.apiKey!.id}`,
        bloodPressureSystolic: data.vitals.bloodPressureSystolic || null,
        bloodPressureDiastolic: data.vitals.bloodPressureDiastolic || null,
        heartRate: data.vitals.heartRate || null,
        respiratoryRate: data.vitals.respiratoryRate || null,
        oxygenSaturation: data.vitals.oxygenSaturation || null,
        temperature: data.vitals.temperature || null,
        weight: data.vitals.weight || null,
        height: data.vitals.height || null,
        painLevel: data.vitals.painLevel || null,
      });
    }
    
    const encounter = await storage.createEncounter({
      patientId: data.patientId,
      providerId: `api_key:${req.apiKey!.id}`,
      organizationId: req.apiPractice!.id,
      encounterDate: new Date(data.encounterDate),
      encounterType: data.encounterType || "telehealth",
      chiefComplaint: data.chiefComplaint || null,
      assessmentSummary: data.assessmentSummary || null,
      rosChecklist: data.rosChecklist || null,
      peChecklist: data.peChecklist || null,
      diagnosisCodes: data.diagnosisCodes || null,
      procedureCodes: data.procedureCodes || null,
      medications: data.medications || null,
      status: "draft",
    });
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "create",
      resourceType: "encounter",
      resourceId: encounter.id,
      patientId: data.patientId,
      details: JSON.stringify({ encounterType: data.encounterType }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.status(201).json({
      success: true,
      data: encounter,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid encounter data",
        details: error.errors,
      });
    }
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while creating encounter",
    });
  }
});

router.get("/encounters/:id", requireScope("encounters:read"), async (req: Request, res: Response) => {
  try {
    const encounterId = parseInt(req.params.id as string);
    if (isNaN(encounterId)) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid encounter ID",
      });
    }
    
    const encounter = await storage.getEncounter(encounterId);
    if (!encounter) {
      return res.status(404).json({
        error: "not_found",
        message: "Encounter not found",
      });
    }
    
    if (encounter.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Encounter belongs to a different organization",
      });
    }
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "view",
      resourceType: "encounter",
      resourceId: encounterId,
      patientId: encounter.patientId,
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: encounter,
    });
  } catch (error: any) {
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while fetching encounter",
    });
  }
});

const CreateAppointmentSchema = z.object({
  patientId: z.number(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  appointmentType: z.string().optional(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).default("scheduled"),
  description: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/appointments", requireScope("appointments:write"), async (req: Request, res: Response) => {
  try {
    const data = CreateAppointmentSchema.parse(req.body);
    
    const patient = await storage.getPatient(data.patientId);
    if (!patient) {
      return res.status(404).json({
        error: "not_found",
        message: "Patient not found",
      });
    }
    
    if (patient.organizationId !== req.apiPractice!.id) {
      return res.status(403).json({
        error: "forbidden",
        message: "Patient belongs to a different organization",
      });
    }
    
    const appointment = await storage.createAppointment({
      patientId: data.patientId,
      userId: `api_key:${req.apiKey!.id}`,
      organizationId: req.apiPractice!.id,
      title: data.title,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      appointmentType: data.appointmentType || "telehealth",
      status: data.status,
      description: data.description || null,
      location: data.location || null,
      notes: data.notes || null,
    });
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "create",
      resourceType: "appointment",
      resourceId: appointment.id,
      patientId: data.patientId,
      details: JSON.stringify({ title: data.title, startTime: data.startTime }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.status(201).json({
      success: true,
      data: appointment,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "validation_error",
        message: "Invalid appointment data",
        details: error.errors,
      });
    }
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while creating appointment",
    });
  }
});

router.get("/appointments", requireScope("appointments:read"), async (req: Request, res: Response) => {
  try {
    const startDate = typeof req.query.startDate === 'string' ? new Date(req.query.startDate) : undefined;
    const endDate = typeof req.query.endDate === 'string' ? new Date(req.query.endDate) : undefined;
    
    let appointments = await storage.getAppointmentsByOrganization(req.apiPractice!.id);
    
    if (startDate) {
      appointments = appointments.filter(a => new Date(a.startTime) >= startDate);
    }
    if (endDate) {
      appointments = appointments.filter(a => new Date(a.startTime) <= endDate);
    }
    
    await storage.createAuditLog({
      userId: `api_key:${req.apiKey!.id}`,
      userEmail: req.apiKey!.name,
      organizationId: req.apiPractice!.id,
      action: "view",
      resourceType: "appointments_list",
      details: JSON.stringify({ startDate, endDate, count: appointments.length }),
      ipAddress: (typeof req.ip === 'string' ? req.ip : req.socket.remoteAddress) || null,
      userAgent: req.headers["user-agent"] || null,
    });
    
    res.json({
      success: true,
      data: appointments.map(a => ({
        id: a.id,
        patientId: a.patientId,
        title: a.title,
        startTime: a.startTime,
        endTime: a.endTime,
        appointmentType: a.appointmentType,
        status: a.status,
        description: a.description,
      })),
    });
  } catch (error: any) {
    console.error("External API error:", error);
    res.status(500).json({
      error: "internal_error",
      message: "An error occurred while fetching appointments",
    });
  }
});

router.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "DocuWhisper External API is operational",
    version: "1.0.0",
    organization: req.apiPractice?.name,
    scopes: req.apiKey?.scopes,
  });
});

export default router;
