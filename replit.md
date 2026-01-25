# DocuWhisper - AI Medical Scribe

AI-powered medical scribing tool that transforms patient consultations into structured SOAP notes. Heidi AI-inspired interface.

## Overview

DocuWhisper helps healthcare providers save 2+ hours daily by automatically transcribing voice recordings and generating structured clinical documentation.

**Core Features:**
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

### Subscription
- `GET /api/subscription` - Get subscription status
- `POST /api/stripe/checkout` - Create Stripe checkout session
- `POST /api/stripe/portal` - Create Stripe billing portal session
- `GET /api/stripe/price` - Get product pricing

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
