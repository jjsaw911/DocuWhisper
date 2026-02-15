# DocuWhisper - AI Medical Scribe

## Overview

DocuWhisper is an AI-powered medical scribing tool designed to convert patient consultations into structured SOAP notes, aiming to save healthcare providers significant time daily. Its core purpose is to streamline clinical documentation through automation and intelligent assistance. The project envisions becoming a comprehensive platform for clinical documentation and practice management.

Key capabilities include:
- Real-time voice recording and transcription with live display.
- AI-driven generation of SOAP notes, referral letters, and patient summaries.
- Suggestion of ICD-10 & CPT codes.
- Comprehensive notes management with auto-save, auto-titling, and custom templates.
- Multi-language support for transcription, generation, and note translation.
- Task management with due dates and note linking.
- Analytics and reporting for productivity and clinical insights.
- Team collaboration features including note sharing and role-based access.
- Advanced features like medical terminology autocomplete, drug interaction alerts, and real-time co-editing.
- HIPAA-compliant architecture with robust audit logging, access control, and data encryption.
- An invite-only EMR system for patient records, scheduling, and document management.

## User Preferences

I prefer iterative development.
I want to be asked before major changes are made.
I like receiving detailed explanations.
I prefer to use simple language.
I want to ensure all HIPAA compliance features are correctly implemented and tested.
I do not want changes to the `server/replit_integrations/` folder.
I do not want changes to the `shared/schema.ts` file without explicit approval.

## System Architecture

**UI/UX Decisions:**
- Professional medical theme using teal/medical green as the primary color.
- Clean and accessible user interface with support for dark mode.
- Responsive design ensuring usability across desktop and mobile devices.
- Implementation of loading and empty states for all views to enhance user experience.

**Technical Implementations:**
- **Real-time Streaming Transcription:** Audio is processed in 15-second chunks, providing live transcript display.
- **AI Integration:** Utilizes OpenAI's gpt-5.1 for SOAP note generation and gpt-4o-mini-transcribe for high-accuracy speech-to-text. Supports self-hosted faster-whisper STT via `TRANSCRIPTION_PROVIDER=local` + `LOCAL_STT_URL` env vars (OpenAI-compatible API), with `LOCAL_STT_API_KEY` for auth.
- **Customizable AI Prompts:** Users can define custom SOAP templates to personalize AI output.
- **Dynamic AI Interaction:** Features AI Instructions for tailoring note generation and a persistent AI command bar for quick queries.
- **Contextual AI:** Background patient information can be added to inform AI generation.
- **Subscription Management:** Integrated with Stripe for managing user subscriptions and payments.
- **Invite System:** Allows for generating and managing invite codes for trials or lifetime access.
- **Audit Logging:** Comprehensive logging of all PHI access and user actions for HIPAA compliance.
- **Access Control:** Role-based access (owner, admin, member) and session management with auto-logout.
- **WebSocket-based Co-editing:** Enables real-time collaborative editing of shared notes with presence indicators.
- **API Architecture:** Organized into distinct routes for authentication, notes, AI, templates, settings, tasks, subscription, admin, practices/teams, note sharing, and analytics.
- **Database Schema Design:** Relational database optimized for medical data, including tables for Notes, Subscriptions, Templates, Invites, User Settings, Tasks, and EMR-specific tables (PatientRecords, Appointments, Documents).

**Feature Specifications:**
- **Visit Modes:** Support for Transcribing, Dictating, or Uploading session audio.
- **Multi-language & Translation:** Supports multiple languages for transcription/generation and translation of existing notes.
- **Medical Terminology Autocomplete & Drug Interaction Alerts:** Enhances documentation accuracy and safety.
- **Team Collaboration:** Functionality for creating practices, inviting members, assigning roles, and sharing notes securely.

## External Dependencies

- **AI Services:** OpenAI (gpt-5.1 for SOAP generation, gpt-4o-mini-transcribe for speech-to-text)
- **Authentication:** Replit Auth (OAuth with Google, GitHub, email)
- **Payment Processing:** Stripe (for subscriptions)
- **Email Service:** Resend (for sending email invitations)
- **Database:** PostgreSQL (with Drizzle ORM)