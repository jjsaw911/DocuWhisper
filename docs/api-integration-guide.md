# DocuWhisper EMR External API Integration Guide

This guide explains how to integrate your external application (e.g., urgent care website) with the DocuWhisper EMR system.

## Base URL

```
https://your-docuwhisper-domain.replit.app/api/external/v1
```

## Authentication

All API requests require a Bearer token in the Authorization header:

```
Authorization: Bearer dw_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys are generated in the DocuWhisper Admin Dashboard under the "API Keys" tab.

## Rate Limiting

- Default: 60 requests per minute per API key
- Rate limits are configurable per API key
- When exceeded, returns HTTP 429 with `Retry-After` header

## Available Scopes

When creating an API key, select the required scopes:

| Scope | Description |
|-------|-------------|
| `patients:read` | Search and view patient records |
| `patients:write` | Create and update patient records |
| `encounters:read` | View encounter/visit records |
| `encounters:write` | Create new encounters |
| `appointments:read` | View appointment schedules |
| `appointments:write` | Create/update/cancel appointments |
| `notes:read` | View clinical notes |
| `notes:write` | Create/update clinical notes |

## API Endpoints

### Patients

#### Search Patients
```
GET /patients/search?q={searchTerm}
Scope: patients:read
```

Response:
```json
{
  "patients": [
    {
      "id": 123,
      "firstName": "John",
      "lastName": "Doe",
      "dateOfBirth": "1985-03-15",
      "email": "john.doe@email.com",
      "phone": "555-123-4567"
    }
  ]
}
```

#### Get Patient by ID
```
GET /patients/{id}
Scope: patients:read
```

#### Create Patient
```
POST /patients
Scope: patients:write
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1985-03-15",
  "gender": "male",
  "email": "john.doe@email.com",
  "phone": "555-123-4567",
  "address": "123 Main St",
  "city": "Springfield",
  "state": "IL",
  "zipCode": "62701"
}
```

#### Update Patient
```
PATCH /patients/{id}
Scope: patients:write
Content-Type: application/json

{
  "phone": "555-987-6543",
  "email": "newemail@email.com"
}
```

#### Get Patient History
```
GET /patients/{id}/history
Scope: patients:read, encounters:read
```

Returns encounters, appointments, and notes for the patient.

### Encounters

#### Create Encounter
```
POST /encounters
Scope: encounters:write
Content-Type: application/json

{
  "patientId": 123,
  "encounterType": "urgent_care",
  "chiefComplaint": "Sore throat and fever",
  "vitals": {
    "temperature": "101.2",
    "bloodPressure": "120/80",
    "heartRate": "88",
    "respiratoryRate": "16",
    "oxygenSaturation": "98"
  },
  "notes": "Patient reports symptoms started 2 days ago"
}
```

#### Get Encounter
```
GET /encounters/{id}
Scope: encounters:read
```

### Appointments

#### List Appointments
```
GET /appointments?date={YYYY-MM-DD}&status={status}
Scope: appointments:read
```

#### Create Appointment
```
POST /appointments
Scope: appointments:write
Content-Type: application/json

{
  "patientId": 123,
  "scheduledAt": "2024-01-15T14:30:00Z",
  "duration": 30,
  "appointmentType": "follow_up",
  "notes": "Follow-up for urgent care visit"
}
```

#### Update Appointment
```
PATCH /appointments/{id}
Scope: appointments:write
Content-Type: application/json

{
  "status": "completed",
  "notes": "Patient arrived on time"
}
```

#### Cancel Appointment
```
DELETE /appointments/{id}
Scope: appointments:write
```

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "unauthorized",
  "message": "Invalid API key"
}
```

| Status | Error | Description |
|--------|-------|-------------|
| 401 | unauthorized | Invalid or missing API key |
| 403 | forbidden | Insufficient scope permissions |
| 404 | not_found | Resource not found |
| 429 | rate_limit_exceeded | Too many requests |
| 500 | internal_error | Server error |

## HIPAA Compliance

All API access is:
- Logged with full audit trail (user, action, timestamp, IP address)
- Encrypted in transit via TLS
- Scoped to the organization associated with the API key
- Subject to access control and rate limiting
