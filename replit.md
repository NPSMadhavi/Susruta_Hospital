# Susruta Hospital Website

## Overview

A complete Ayurvedic hospital SPA for Susruta Hospital, Tirupati, India. Features Dr. P. Murali Krishna's profile, calendar appointment booking, patient portal with email+password auth, appointment tracking with full lifecycle, admin panel with approval workflow, real-time SSE notifications, newsletter subscription management, and an **Online Consultation System** with weekly Sunday slot booking, doctor portal with prescription notepad, and patient document uploads.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS, Wouter routing, Zustand, Framer Motion, date-fns, Lucide icons
- **Design**: White & deep forest green Ayurvedic theme

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express API server (port 8080)
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── auth.ts          # Admin session management
│   │       │   ├── patient-auth.ts  # Patient session management
│   │       │   └── email.ts         # Email (magic link, subscription)
│   │       └── routes/
│   │           ├── admin.ts           # Admin auth & settings
│   │           ├── appointments.ts    # Appointment CRUD + SSE notifications
│   │           ├── availability.ts    # Date/slot management
│   │           ├── testimonials.ts    # Testimonials CRUD
│   │           ├── patient.ts         # Patient auth + portal appointments
│   │           └── subscribers.ts     # Newsletter subscription management
│   └── susruta-hospital/     # React Vite frontend (root /)
│       └── src/
│           ├── pages/
│           │   ├── home.tsx              # Main home page (SPA sections)
│           │   ├── appointments.tsx      # Public walk-in booking
│           │   ├── not-found.tsx
│           │   ├── admin/
│           │   │   ├── login.tsx, dashboard.tsx
│           │   │   ├── appointments.tsx  # Full lifecycle admin view
│           │   │   ├── availability.tsx
│           │   │   ├── testimonials.tsx
│           │   │   ├── subscribers.tsx   # Newsletter subscriber mgmt
│           │   │   ├── online-slots.tsx  # Online consultation slot manager
│           │   │   └── settings.tsx      # + Doctor Portal password section
│           │   ├── doctor/
│           │   │   ├── login.tsx         # Doctor portal login (shared password)
│           │   │   └── appointments.tsx  # Patient docs + prescription notepad + private notes
│           │   └── portal/
│           │       ├── login.tsx         # Patient login/register
│           │       ├── dashboard.tsx     # Appointment tracking + online consultations
│           │       ├── book.tsx          # Calendar appointment booking
│           │       └── online-book.tsx   # 3-step online consultation booking wizard
│           ├── components/
│           │   ├── layout/PublicLayout.tsx
│           │   ├── admin/AdminLayout.tsx
│           │   └── SubscribePopup.tsx    # Newsletter popup modal
│           ├── lib/
│           │   ├── patient-api.ts   # Patient API client
│           │   └── i18n.ts          # EN/TE translations
│           └── store/use-language.ts # Zustand lang store
├── lib/
│   ├── api-spec/openapi.yaml  # Full API contract
│   ├── api-client-react/      # Generated React Query hooks
│   ├── api-zod/               # Generated Zod schemas
│   └── db/src/schema/
│       ├── appointments.ts    # id, patientId, date, timeSlot, status, arrivedAt, paymentMode, rescheduleDates, followUpDate...
│       ├── patients.ts        # id, email, name, phone, passwordHash, emailVerified
│       ├── patient_sessions.ts
│       ├── login_tokens.ts    # Email verification tokens
│       ├── blocked_dates.ts
│       ├── open_months.ts
│       ├── testimonials.ts
│       ├── subscribers.ts     # Newsletter subscribers
│       ├── site_settings.ts              # + doctorPasswordHash field
│       ├── admin_sessions.ts
│       ├── online_slot_sessions.ts       # Session (date + time range)
│       ├── online_slots.ts              # Individual bookable slots
│       ├── online_appointments.ts       # Patient slot bookings + doc uploads
│       ├── prescriptions.ts             # Doctor prescriptions + private notes
│       └── doctor_sessions.ts           # Doctor portal sessions
```

## Features

### Public Website (Single Page)
- **Hero** — Dr. Murali Krishna photo, rotating taglines, credentials CTA
- **About Doctor** — Full bio, qualifications (BAMS Gold Medalist, MD, PhD, FRAV, DYoga)
- **Achievements** — 10+ national awards, publications (30+), lectures (147+), positions
- **Services** — Ayurvedic treatments & Panchakarma
- **Testimonials** — Patient reviews (conditionally shown)
- **Contact** — Address (GS North Mada Veedhi, Tirupati), phone, hours, Google Maps embed
- **Newsletter Popup** — Appears 2.5s after load, session-dismissed, collects name/phone/email

### Patient Portal (`/portal`)
- **Auth** — Email + password register/login; auto-login on register; email verification via magic link
- **Dashboard** (`/portal/dashboard`) — Welcome card, stats (upcoming/completed/missed), 4-stage appointment progress tracker, follow-up confirmation, reschedule date picker. Polls every 15s for live updates.
- **Booking** (`/portal/book`) — Calendar grid (open months only), time slot picker (available slots), phone input if not on record

### Admin Panel (`/admin`)
- **Login** — Session-based auth (30-day cookie)
- **Dashboard** — Appointment summary cards
- **Appointments** — Full lifecycle: Pending → Approve/Reschedule/Decline → Arrived → Paid (Cash/UPI modal) → Follow-up; SSE real-time notifications + browser notification API + audio chime; 30s polling fallback
- **Availability** — Open/close months, block specific dates
- **Testimonials** — Add, edit, publish/unpublish, delete
- **Subscribers** — List, delete, CSV export, Excel/CSV bulk import
- **Online Slots** (`/admin/online-slots`) — Create Sunday consultation sessions (date + start/end time + 15/30 min interval), live slot preview, session list with expand/collapse showing individual slot bookings
- **Settings** — Toggle testimonials, enable/disable booking, contact info, SMTP config, DNS deliverability checklist, **Doctor Portal password setup**

### Doctor Portal (`/doctor`)
- **Login** — Shared password set by admin in Settings; stored as bcrypt hash; cookie valid 7 days
- **Appointments** (`/doctor/appointments`) — Full list of booked online consultations; filter by All/Pending/Completed
- Each appointment expands to show:
  - Patient info (name, email, phone)
  - Downloadable patient documents
  - Prescription notepad (medicine name + dosage, +add more rows, delete rows)
  - Private notes textarea (doctor-only, not visible to patient)
  - Save prescription → marks appointment Completed
  - Save notes independently

### Online Consultation System
- **Patient booking** (`/portal/online-book`) — 3-step wizard: Select Slot → Upload Documents → Confirm
  - Slots grouped by date (Sundays); each slot card shows time range
  - Document upload: files go to GCS via presigned URL (request-url → PUT); minimum 1 required
  - Reason for consultation (optional textarea)
  - Booking marks slot as taken, creates appointment with `confirmed` status
- **Patient dashboard** — Shows Online Consultations section with each booking card (expandable):
  - Status badge (confirmed/completed/cancelled)
  - Prescription shown when available (medicines + instructions)
  - List of uploaded documents (downloadable links)
- **Prescriptions** — `medicines[]` (array of { medicine, instructions }) visible to patient; `doctorNotes` private

### Language Support
- English default; Telugu translations exist but language selector hidden pending translation quality review
- Translations in `lib/i18n.ts`

## Admin Credentials
- **Username**: `admin`
- **Password**: `susruta2024`
- Override with `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables

## Key API Endpoints

### Patient Portal
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/patient/auth/register | Register (sets cookie, auto-login) |
| POST | /api/patient/auth/login | Login |
| GET | /api/patient/auth/verify?token= | Email verification (redirects) |
| POST | /api/patient/logout | Logout |
| GET | /api/patient/me | Current patient |
| GET | /api/patient/appointments | My appointments |
| POST | /api/patient/appointments | Book appointment |
| PATCH | /api/patient/appointments/:id/confirm-followup | Confirm follow-up |
| PATCH | /api/patient/appointments/:id/choose-reschedule | Choose reschedule date |

### Appointments (Admin)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/appointments/notifications | SSE stream |
| POST | /api/appointments | Walk-in booking |
| GET | /api/appointments | List (with filters) |
| PATCH | /api/appointments/:id | Update status/notes |
| PATCH | /api/appointments/:id/arrive | Mark arrived |
| PATCH | /api/appointments/:id/pay | Mark paid (cash/upi) |
| PATCH | /api/appointments/:id/reschedule | Propose reschedule dates |
| PATCH | /api/appointments/:id/followup | Set follow-up date |
| DELETE | /api/appointments/:id | Delete |

### Subscribers
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/subscribers | Subscribe (public) |
| GET | /api/subscribers | List (admin) |
| DELETE | /api/subscribers/:id | Delete (admin) |
| POST | /api/subscribers/import | Bulk import CSV/Excel (admin) |

## Important Implementation Notes

- **Zod import**: `import { z } from "zod/v4"` (not `"zod"`)
- **Logo**: `@assets/logo_1773840200056.png`
- **DB push**: `cd lib/db && pnpm run push`
- **useListOpenMonths hook**: Returns `{ id, month, isOpen, createdAt }[]` — map to string[] with `.filter(m => m.isOpen).map(m => m.month)`
- **useGetAvailability hook**: Takes `{ month: string }` object as first arg
- **useGetSlots hook**: Takes `{ date: string }` object as first arg; returns `{ time, available }[]` — filter `available` and map `.time`
- **SSE notifications**: `notifyNewAppointment` in `appointments.ts` — called from both walk-in and portal booking routes
- **Newsletter popup**: `sessionStorage` key `susruta_popup_dismissed`; appears once per session after 2.5s

## Color Theme
- Primary: Deep forest green `#1a3d2b` / Tailwind `primary`
- Background: White / light mint
- Accents: Amber/golden for follow-ups, teal for arrived, orange for reschedule
- Typography: Serif (headings), sans-serif (body)

## Key Assets
- `attached_assets/logo_1773840200056.png` — Hospital logo
- `attached_assets/Dr_Murali_Krishna_1773837837953.jpeg` — Doctor photo
- Imported via `@assets/` alias in frontend

## Footer Credit
"Designed with Gratitude from RSV Infotech Pte. Ltd." → https://myrsv.com
