# Susruta Hospital Website

## Overview

A complete bilingual (English/Telugu) Ayurvedic hospital website for Susruta Hospital, Tirupati, India. The website showcases Dr. P. Murali Krishna's expertise, handles appointment bookings, and includes an admin panel for hospital management.

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
- **Design**: White & green nature/Ayurveda inspired theme

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express API server (port 8080)
│   │   └── src/
│   │       ├── lib/auth.ts   # Admin session management
│   │       └── routes/
│   │           ├── admin.ts           # Admin auth & settings
│   │           ├── appointments.ts    # Appointment CRUD
│   │           ├── availability.ts    # Date/slot management
│   │           └── testimonials.ts    # Testimonials CRUD
│   └── susruta-hospital/     # React Vite frontend (root /)
│       └── src/
│           ├── pages/
│           │   ├── home.tsx, about.tsx, achievements.tsx
│           │   ├── services.tsx, appointments.tsx
│           │   ├── testimonials.tsx, contact.tsx
│           │   └── admin/
│           │       ├── login.tsx, dashboard.tsx
│           │       ├── appointments.tsx, availability.tsx
│           │       ├── testimonials.tsx, settings.tsx
│           ├── components/layout/PublicLayout.tsx
│           ├── components/admin/AdminLayout.tsx
│           ├── store/use-language.ts   # Zustand lang store
│           └── lib/i18n.ts             # EN/TE translations
├── lib/
│   ├── api-spec/openapi.yaml  # Full API contract
│   ├── api-client-react/      # Generated React Query hooks
│   ├── api-zod/               # Generated Zod schemas
│   └── db/src/schema/         # Database tables
│       ├── appointments.ts
│       ├── blocked_dates.ts
│       ├── open_months.ts
│       ├── testimonials.ts
│       ├── site_settings.ts
│       └── admin_sessions.ts
```

## Features

### Public Website
- **Home** - Hero with Dr. Murali Krishna's photo, credentials, CTA
- **About Doctor** - Full bio, qualifications, career
- **Achievements** - 10+ awards, positions, publications (30+), lectures (147+)
- **Services** - Ayurvedic treatments & Panchakarma
- **Appointments** - Step-by-step booking (only shows open months/dates)
- **Testimonials** - Patient reviews (conditionally shown)
- **Contact** - Address, phone, working hours

### Language Support
- English (default) + Telugu toggle in top navbar
- All key UI text has EN/TE translations in `lib/i18n.ts`

### Admin Panel (`/admin`)
- **Login** - Secure session-based auth
- **Dashboard** - Appointment summary
- **Appointments** - View, filter, confirm/cancel appointments
- **Availability** - Open/close months, block specific dates
- **Testimonials** - Add, edit, publish/unpublish, delete
- **Settings** - Toggle testimonials, enable/disable booking, contact info

## Admin Credentials
- **Username**: `admin`
- **Password**: `susruta2024`

To change: Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/admin/login | Admin login |
| POST | /api/admin/logout | Admin logout |
| GET | /api/admin/me | Session check |
| GET/PATCH | /api/admin/settings | Site settings |
| POST | /api/appointments | Book appointment |
| GET | /api/appointments | List appointments (admin) |
| PATCH | /api/appointments/:id | Update status (admin) |
| DELETE | /api/appointments/:id | Delete (admin) |
| GET | /api/availability?month= | Month availability |
| GET | /api/availability/slots?date= | Time slots for date |
| GET/POST | /api/availability/blocked-dates | Blocked dates |
| DELETE | /api/availability/blocked-dates/:id | Unblock date |
| GET/POST | /api/availability/months | Open months |
| DELETE | /api/availability/months/:id | Close month |
| GET | /api/testimonials | Published testimonials |
| POST | /api/testimonials | Create (admin) |
| PATCH | /api/testimonials/:id | Update (admin) |
| DELETE | /api/testimonials/:id | Delete (admin) |

## Color Theme (White & Green Ayurvedic)
- Primary: Deep forest green
- Background: White / light mint
- Accents: Golden/warm earth tones
- Typography: Serif for headings, Sans-serif for body

## Key Assets
- `attached_assets/logo_1773840200056.png` - Hospital logo
- `attached_assets/Dr_Murali_Krishna_1773837837953.jpeg` - Doctor photo
- Imported via `@assets/` alias in frontend
