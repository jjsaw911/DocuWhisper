/**
 * DocuWhisper EMR API Client
 * 
 * Copy this file to your urgent care website project and use it to
 * interact with the DocuWhisper EMR system.
 * 
 * Usage:
 * ```typescript
 * import { DocuWhisperClient } from './docuwhisper-api-client';
 * 
 * const client = new DocuWhisperClient({
 *   apiKey: 'dw_live_your_api_key_here',
 *   baseUrl: 'https://your-docuwhisper-domain.replit.app'
 * });
 * 
 * // Search for a patient
 * const patients = await client.searchPatients('John Doe');
 * 
 * // Create a new patient
 * const newPatient = await client.createPatient({
 *   firstName: 'Jane',
 *   lastName: 'Smith',
 *   dateOfBirth: '1990-05-20',
 *   gender: 'female',
 *   email: 'jane.smith@email.com',
 *   phone: '555-123-4567'
 * });
 * 
 * // Create an encounter
 * const encounter = await client.createEncounter({
 *   patientId: newPatient.id,
 *   encounterType: 'urgent_care',
 *   chiefComplaint: 'Fever and cough',
 *   vitals: {
 *     temperature: '101.5',
 *     bloodPressure: '118/76',
 *     heartRate: '92'
 *   }
 * });
 * ```
 */

export interface DocuWhisperConfig {
  apiKey: string;
  baseUrl: string;
}

export interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface CreatePatientInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface Vitals {
  temperature?: string;
  bloodPressure?: string;
  heartRate?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
  weight?: string;
  height?: string;
}

export interface Encounter {
  id: number;
  patientId: number;
  encounterType: string;
  chiefComplaint?: string;
  vitals?: Vitals;
  notes?: string;
  status: string;
  createdAt: string;
}

export interface CreateEncounterInput {
  patientId: number;
  encounterType: string;
  chiefComplaint?: string;
  vitals?: Vitals;
  notes?: string;
}

export interface Appointment {
  id: number;
  patientId: number;
  scheduledAt: string;
  duration: number;
  appointmentType: string;
  status: string;
  notes?: string;
}

export interface CreateAppointmentInput {
  patientId: number;
  scheduledAt: string;
  duration?: number;
  appointmentType?: string;
  notes?: string;
}

export interface PatientHistory {
  patient: Patient;
  encounters: Encounter[];
  appointments: Appointment[];
}

export interface ApiError {
  error: string;
  message: string;
}

export class DocuWhisperClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DocuWhisperConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '') + '/api/external/v1';
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: 'unknown', 
        message: response.statusText 
      }));
      throw new DocuWhisperApiError(
        response.status,
        errorData.error || 'unknown',
        errorData.message || 'An error occurred'
      );
    }

    return response.json();
  }

  // ============ Patient Methods ============

  /**
   * Search for patients by name, email, or phone
   */
  async searchPatients(query: string): Promise<{ patients: Patient[] }> {
    return this.request('GET', `/patients/search?q=${encodeURIComponent(query)}`);
  }

  /**
   * Get a patient by ID
   */
  async getPatient(id: number): Promise<Patient> {
    return this.request('GET', `/patients/${id}`);
  }

  /**
   * Create a new patient
   */
  async createPatient(data: CreatePatientInput): Promise<Patient> {
    return this.request('POST', '/patients', data);
  }

  /**
   * Update an existing patient
   */
  async updatePatient(id: number, data: Partial<CreatePatientInput>): Promise<Patient> {
    return this.request('PATCH', `/patients/${id}`, data);
  }

  /**
   * Get patient history including encounters and appointments
   */
  async getPatientHistory(id: number): Promise<PatientHistory> {
    return this.request('GET', `/patients/${id}/history`);
  }

  // ============ Encounter Methods ============

  /**
   * Create a new encounter/visit
   */
  async createEncounter(data: CreateEncounterInput): Promise<Encounter> {
    return this.request('POST', '/encounters', data);
  }

  /**
   * Get an encounter by ID
   */
  async getEncounter(id: number): Promise<Encounter> {
    return this.request('GET', `/encounters/${id}`);
  }

  // ============ Appointment Methods ============

  /**
   * List appointments, optionally filtered by date and status
   */
  async listAppointments(options?: { 
    date?: string; 
    status?: string 
  }): Promise<{ appointments: Appointment[] }> {
    const params = new URLSearchParams();
    if (options?.date) params.append('date', options.date);
    if (options?.status) params.append('status', options.status);
    
    const queryString = params.toString();
    return this.request('GET', `/appointments${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Create a new appointment
   */
  async createAppointment(data: CreateAppointmentInput): Promise<Appointment> {
    return this.request('POST', '/appointments', data);
  }

  /**
   * Update an appointment
   */
  async updateAppointment(
    id: number, 
    data: Partial<Omit<CreateAppointmentInput, 'patientId'>> & { status?: string }
  ): Promise<Appointment> {
    return this.request('PATCH', `/appointments/${id}`, data);
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(id: number): Promise<void> {
    await this.request('DELETE', `/appointments/${id}`);
  }

  // ============ Health Check ============

  /**
   * Check API connectivity and key validity
   */
  async healthCheck(): Promise<{ status: string; organization: string }> {
    return this.request('GET', '/health');
  }
}

/**
 * Custom error class for API errors
 */
export class DocuWhisperApiError extends Error {
  public status: number;
  public errorCode: string;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = 'DocuWhisperApiError';
    this.status = status;
    this.errorCode = errorCode;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ============ Usage Example ============
/*
import { DocuWhisperClient, DocuWhisperApiError } from './docuwhisper-api-client';

// Initialize the client with your API key
const emrClient = new DocuWhisperClient({
  apiKey: process.env.DOCUWHISPER_API_KEY || 'dw_live_xxx',
  baseUrl: 'https://your-docuwhisper-app.replit.app'
});

// Example: Register a new urgent care patient
async function registerUrgentCarePatient(patientData: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  chiefComplaint: string;
}) {
  try {
    // First, check if patient already exists
    const { patients } = await emrClient.searchPatients(
      `${patientData.firstName} ${patientData.lastName}`
    );
    
    let patient;
    
    if (patients.length > 0) {
      // Use existing patient
      patient = patients[0];
      console.log('Found existing patient:', patient.id);
    } else {
      // Create new patient
      patient = await emrClient.createPatient({
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        dateOfBirth: patientData.dateOfBirth,
        phone: patientData.phone
      });
      console.log('Created new patient:', patient.id);
    }

    // Create the encounter
    const encounter = await emrClient.createEncounter({
      patientId: patient.id,
      encounterType: 'urgent_care',
      chiefComplaint: patientData.chiefComplaint
    });

    console.log('Created encounter:', encounter.id);
    return { patient, encounter };

  } catch (error) {
    if (error instanceof DocuWhisperApiError) {
      if (error.isRateLimited()) {
        console.error('Rate limited - try again later');
      } else if (error.isUnauthorized()) {
        console.error('Invalid API key');
      } else {
        console.error('API Error:', error.message);
      }
    }
    throw error;
  }
}
*/
