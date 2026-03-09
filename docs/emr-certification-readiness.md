# EMR Certification Readiness Plan

Last updated: 2026-03-05

## Goal

Prepare DocuWhisper for U.S. ONC Health IT Module certification and downstream CEHRT compatibility.

## Current Baseline

- Product currently discloses it is not a certified EHR.
- Core EMR data model exists for patients, encounters, vitals, appointments, documents, and audit logs.
- Backup export exists (`/api/backup/export`) for scribe + EMR data.
- FHIR foundation endpoint now exists at `/api/fhir/r4` with `metadata`, `Patient` read, and `Patient` search.

## Workstreams

| Workstream | Objective | Current Status | Deliverable |
| --- | --- | --- | --- |
| Certification scope | Select exact ONC criteria and certification package | Not started | Criteria matrix with target edition and test methods |
| Regulatory partner | Engage ONC-ATL and ONC-ACB | Not started | Partner selected and intake completed |
| Interoperability API | Build standards-based API surface for required criteria | In progress | FHIR R4 API + conformance artifacts |
| EHI export | Implement criterion-ready export package and test evidence | Not started | Export endpoint + export validation suite |
| Clinical safety/DSI | Build decision support intervention transparency data | Not started | DSI documentation + provenance records |
| Privacy/security criteria | Implement and verify required technical safeguards | Not started | Security control matrix + test artifacts |
| CPOE/eRx | Add compliant ordering and e-prescribing workflows | Not started | Structured order and prescribing modules |
| CQM | Implement quality measure capture/export pipeline | Not started | CQM extraction and submission artifacts |
| Patient access | Deliver patient-facing data access functionality | Not started | Patient access module + audit logs |
| Certification ops | Build evidence packages, disclosures, and maintenance process | Not started | Submission-ready certification binder |

## Phase 1 (Now to Next Milestone)

1. Establish standards API foundation.
2. Add criterion traceability matrix in repo.
3. Define data mappings from internal schema to USCDI-aligned FHIR resources.
4. Add conformance smoke tests for every exposed FHIR route.
5. Add change-control and evidence capture process for certification artifacts.

## Phase 1 Completed This Session

1. Added FHIR foundation routes under `/api/fhir/r4`.
2. Implemented capability statement endpoint (`GET /api/fhir/r4/metadata`).
3. Implemented `Patient` read endpoint (`GET /api/fhir/r4/Patient/:id`) with access controls.
4. Implemented `Patient` search endpoint (`GET /api/fhir/r4/Patient`) with pagination and common filters.
5. Implemented `Encounter` read/search endpoints (`GET /api/fhir/r4/Encounter/:id`, `GET /api/fhir/r4/Encounter`).
6. Implemented `Observation` search endpoint for vitals (`GET /api/fhir/r4/Observation`).

## Immediate Next Tasks

1. Add FHIR read endpoint for Observation by id plus full vitals profile coverage.
2. Add FHIR-compatible auth profile plan (SMART-on-FHIR target architecture).
3. Add automated API conformance checks in CI.
4. Build a criterion-by-criterion gap table with explicit pass/fail evidence links.
5. Define ONC-ATL pre-testing package checklist.
