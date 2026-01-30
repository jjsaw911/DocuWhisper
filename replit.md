# DocuWhisper - AI Medical Scribe

AI-powered medical scribing tool that transforms patient consultations into structured SOAP notes. Heidi AI-inspired interface.

## Overview

DocuWhisper helps healthcare providers save 2+ hours daily by automatically transcribing voice recordings and generating structured clinical documentation.

**Core Features:**
- **Real-time streaming transcription:** Audio is sent in 15-second chunks during recording, with live transcript display as each chunk is processed
- Voice recording with pause/resume and audio level visualization
- AI transcription and automatic SOAP note generation
- **Auto-save:** Notes are automatically saved after transcription
- **Auto-title:** If no patient name provided, AI generates title from symptoms/complaints
- **AI Instructions:** Tell AI what to omit or add context when regenerating notes
- Custom SOAP templates for personalized AI prompts
- Notes management with unified view (SOAP + Transcript in one page)
- Copy buttons for each section and full note
- Export to PDF and share functionality
- User authentication via Replit Auth
- $25/month subscription via Stripe
- **Admin Dashboard:** Owner can view subscribers, extend memberships, create invite codes
- **Invite System:** Generate codes for free trials, months, or lifetime access
- **Email Invitations:** Send invite links directly to patient email addresses via Resend
- **Settings Page:** Profile editing, clinical preferences, language settings, and recording preferences
- **Multi-language Support:** Transcription and SOAP generation in English, Spanish, French, German, Portuguese
- **Note Translation:** Translate existing SOAP notes to different languages
- **Referral Letter Generation:** AI-generated professional referral letters from SOAP notes
- **ICD-10 & CPT Code Suggestions:** AI-powered billing code recommendations based on encounter documentation
- **AI Chat Assistant:** Built-in AI assistant for documentation questions and clinical guidance
- **Patient Summary Generation:** Generate brief, detailed, handover, or discharge summaries
- **Visit Modes:** Choose between Transcribing, Dictating, or Upload session audio modes
- **Context Tab:** Add background patient information (history, medications, allergies) that informs AI generation
- **Ask AI to do anything:** Persistent AI command bar at the bottom of the session for quick AI interactions
- **Tasks:** Clinical task management for referrals, orders, coordination, and communication follow-ups with filtering and status tracking
- **Task Due Dates:** Set due dates on tasks with overdue indicators and "due today" warnings
- **Task-Note Linking:** Create tasks directly from notes, auto-populating patient name
- **Patient Context Persistence:** Background patient info (patientContext field) stored with each note
- **Analytics Dashboard:** View total notes, weekly stats, task completion rates, and time saved
- **Email Notifications:** Daily task digest emails with configurable delivery time
- **Template Sharing:** Share templates publicly for other users to clone, browse public templates
- **Team Collaboration:** Create practices/teams, invite team members, assign roles (owner, admin, member)
- **Note Sharing:** Share notes with team practices, view notes shared with you, manage share permissions
- **Shared Notes Page:** Dedicated view for notes shared with you by team members
- **Advanced Analytics:** Productivity trends (notes per day chart), trending diagnoses (most common conditions), insights summary

## Tech Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS + Shadcn UI
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **AI:** OpenAI gpt-5.1 (SOAP generation), gpt-4o-mini-transcribe (speech-to-text)
- **Auth:** Replit Auth (OAuth with Google, GitHub, email)
- **Payments:** Stripe subscription ($25/month)

## Project Structure

```
├── client/                  # Frontend React app
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── ui/          # Shadcn components
│   │   │   └── app-sidebar.tsx # Main sidebar navigation
│   │   ├── pages/           # Page components
│   │   │   ├── landing.tsx  # Public landing page
│   │   │   ├── session.tsx  # Main recording/scribing interface
│   │   │   ├── notes.tsx    # Notes list
│   │   │   ├── note-detail.tsx # Single note view with SOAP/Transcript tabs
│   │   │   ├── templates.tsx # Template management
│   │   │   └── subscription.tsx # Subscription management
│   │   ├── hooks/           # Custom hooks
│   │   └── lib/             # Utilities
│   └── public/              # Static assets
├── server/                  # Backend Express app
│   ├── index.ts             # Main entry point
│   ├── routes.ts            # API routes
│   ├── storage.ts           # Database operations
│   ├── stripeClient.ts      # Stripe integration
│   ├── webhookHandlers.ts   # Stripe webhooks
│   └── replit_integrations/ # Auto-generated integrations
├── shared/
│   └── schema.ts            # Database schema + types
└── scripts/
    └── seed-products.ts     # Stripe product setup
```

## Database Schema

### Notes Table
- `id` - Auto-incrementing primary key
- `userId` - Owner's user ID (from Replit Auth)
- `title` - Note title
- `patientName` - Optional patient name
- `specialty` - Medical specialty
- `subjective`, `objective`, `assessment`, `plan` - SOAP sections
- `transcript` - Original transcription
- `createdAt`, `updatedAt` - Timestamps

### Subscriptions Table
- `id` - Auto-incrementing primary key
- `userId` - User ID (unique)
- `stripeCustomerId` - Stripe customer ID
- `stripeSubscriptionId` - Stripe subscription ID
- `status` - Subscription status (active/inactive/canceled)
- `currentPeriodEnd` - When subscription renews

### Templates Table
- `id` - Auto-incrementing primary key
- `userId` - Owner's user ID
- `name` - Template name
- `description` - Optional description
- `prompt` - Custom AI prompt for SOAP generation
- `isDefault` - Whether this is the user's default template
- `isPublic` - Whether template is publicly shared (default: false)
- `sharedWith` - Array of user IDs template is shared with
- `createdAt`, `updatedAt` - Timestamps

### Invites Table
- `id` - Auto-incrementing primary key
- `code` - Unique 8-character invite code
- `membershipType` - Type of membership (trial_7, trial_14, trial_30, months_1, months_3, months_6, months_12, lifetime)
- `emailSentTo` - Email address the invite was sent to (if sent via email)
- `usedBy` - User ID who redeemed the code
- `usedAt` - When the code was used
- `createdAt` - When the code was created
- `expiresAt` - Optional expiration date for the code itself

### User Settings Table
- `id` - Auto-incrementing primary key
- `userId` - User ID (unique)
- `firstName`, `lastName` - User's name
- `specialty` - Medical specialty (e.g., "Primary Care", "Cardiology")
- `practiceName` - Practice or organization name
- `language` - Preferred language (default: "en")
- `defaultTemplateId` - Default template for new sessions
- `noteStyle` - Note generation style ("detailed", "concise", "bullet_points")
- `autoSaveEnabled` - Whether to auto-save notes (default: true)
- `showTimestamps` - Show timestamps in transcript (default: true)
- `emailNotificationsEnabled` - Whether to receive daily task digest (default: false)
- `emailDigestTime` - Time to receive daily digest (default: "08:00")
- `createdAt`, `updatedAt` - Timestamps

### Tasks Table
- `id` - Auto-incrementing primary key
- `userId` - Owner's user ID
- `noteId` - Optional link to a note
- `title` - Task description
- `patientName` - Optional patient name
- `category` - Task category: "document", "order", "coordinate", "communicate"
- `status` - Task status: "todo", "completed"
- `dueDate` - Optional due date for the task
- `completedAt` - When the task was completed
- `createdAt`, `updatedAt` - Timestamps

## API Endpoints

### Authentication
- `GET /api/login` - Initiate login
- `GET /api/logout` - Log out
- `GET /api/auth/user` - Get current user

### Notes
- `GET /api/notes` - List user's notes
- `GET /api/notes/:id` - Get single note
- `POST /api/notes` - Create note
- `PATCH /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note

### AI
- `POST /api/transcribe` - Transcribe audio (multipart form)
- `POST /api/generate-soap` - Generate SOAP note from transcript (optional templateId parameter)
- `POST /api/generate-title` - Generate title from transcript based on symptoms/complaints

### Templates
- `GET /api/templates` - List user's templates
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `GET /api/templates/public` - List all public templates
- `GET /api/templates/shared` - List templates shared with the user
- `POST /api/templates/:id/clone` - Clone a template to user's collection

### Settings
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings

### Tasks
- `GET /api/tasks` - List user's tasks
- `GET /api/tasks/:id` - Get single task
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/complete` - Mark task complete
- `POST /api/tasks/:id/uncomplete` - Reopen task

### Subscription
- `GET /api/subscription` - Get subscription status
- `POST /api/stripe/checkout` - Create Stripe checkout session
- `POST /api/stripe/portal` - Create Stripe billing portal session
- `GET /api/stripe/price` - Get product pricing
- `POST /api/invites/redeem` - Redeem an invite code

### Admin (Owner Only)
- `GET /api/admin/check` - Check if current user is admin
- `GET /api/admin/subscribers` - List all subscribers
- `POST /api/admin/extend-subscription` - Extend a user's subscription
- `GET /api/admin/invites` - List all invite codes
- `POST /api/admin/invites` - Create new invite code
- `POST /api/admin/send-invite` - Send invite email to a patient
- `DELETE /api/admin/invites/:id` - Delete invite code

### Practices/Teams
- `GET /api/practices` - List practices user belongs to
- `POST /api/practices` - Create new practice
- `PATCH /api/practices/:id` - Update practice
- `DELETE /api/practices/:id` - Delete practice
- `GET /api/practices/:id/members` - Get practice members
- `POST /api/practices/:id/members` - Add member to practice
- `DELETE /api/practices/:id/members/:userId` - Remove member

### Note Sharing
- `POST /api/notes/:id/share` - Share note with user/practice
- `GET /api/notes/:id/shares` - Get share info for a note
- `DELETE /api/notes/shares/:shareId` - Unshare a note
- `GET /api/shared-notes` - Get notes shared with current user

### Analytics
- `GET /api/analytics` - Get basic analytics (total notes, tasks, etc.)
- `GET /api/analytics/productivity` - Get productivity trends (notes per day)
- `GET /api/analytics/diagnoses` - Get trending diagnoses

## Environment Variables

- `OWNER_EMAIL` - Email address of the admin/owner (for admin dashboard access)
- `RESEND_API_KEY` - Resend API key for sending email invitations
- `RESEND_FROM_EMAIL` - (Optional) Custom from email address for invitations

## Development

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to database
npx tsx scripts/seed-products.ts  # Create Stripe products
```

## Key Technical Notes

1. **Stripe Webhook:** Must be registered BEFORE `express.json()` middleware to receive raw Buffer
2. **Audio Processing:** Uses Replit AI integrations for format conversion and transcription
3. **AI Models:** gpt-5.1 for SOAP generation, gpt-4o-mini-transcribe for speech-to-text
4. **Auth Flow:** Unauthenticated users see landing page, authenticated users see dashboard

## Design

- Professional medical theme with teal/medical green primary color
- Clean, accessible UI with dark mode support
- Responsive design for desktop and mobile
- Loading states and empty states for all views
