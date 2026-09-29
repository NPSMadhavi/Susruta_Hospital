--
-- PostgreSQL database dump
--

\restrict Xem6nCcdBS7846xX9VTlNt5vnObiQFL4FrzA7WI7efzwuAczrTSegMF4WMyId0y

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_table_access_method = heap;

--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id integer NOT NULL,
    session_token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: admin_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_sessions_id_seq OWNED BY public.admin_sessions.id;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id integer NOT NULL,
    patient_name character varying(255) NOT NULL,
    patient_phone character varying(20) NOT NULL,
    patient_email character varying(255),
    date character varying(10) NOT NULL,
    time_slot character varying(20) NOT NULL,
    reason text,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    patient_id integer,
    arrived_at timestamp without time zone,
    payment_status character varying(20) DEFAULT 'unpaid'::character varying NOT NULL,
    payment_mode character varying(10),
    reschedule_dates text,
    reschedule_chosen character varying(10),
    follow_up_date character varying(10),
    follow_up_confirmed boolean DEFAULT false NOT NULL
);


--
-- Name: appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;


--
-- Name: blocked_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_dates (
    id integer NOT NULL,
    date character varying(10) NOT NULL,
    reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_dates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocked_dates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocked_dates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocked_dates_id_seq OWNED BY public.blocked_dates.id;


--
-- Name: direct_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_calls (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    room_name character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    patient_joined_at timestamp without time zone,
    ended_at timestamp without time zone
);


--
-- Name: direct_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.direct_calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: direct_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.direct_calls_id_seq OWNED BY public.direct_calls.id;


--
-- Name: doctor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_sessions (
    id integer NOT NULL,
    session_token character varying(128) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: doctor_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doctor_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doctor_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doctor_sessions_id_seq OWNED BY public.doctor_sessions.id;


--
-- Name: donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.donations (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    appointment_id integer,
    patient_code character varying(10),
    patient_name character varying(255),
    patient_email character varying(255),
    amount character varying(20) NOT NULL,
    last_six_digits character varying(6) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    thank_you_sent boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: donations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.donations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: donations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.donations_id_seq OWNED BY public.donations.id;


--
-- Name: login_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_tokens (
    id integer NOT NULL,
    token character varying(128) NOT NULL,
    patient_id integer NOT NULL,
    next_url character varying(500) DEFAULT '/portal/dashboard'::character varying,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    verification_email character varying(255)
);


--
-- Name: login_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_tokens_id_seq OWNED BY public.login_tokens.id;


--
-- Name: medicine_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicine_order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    medicine_name character varying(255) NOT NULL,
    instructions character varying(500),
    qty integer DEFAULT 1 NOT NULL,
    available boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medicine_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicine_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicine_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicine_order_items_id_seq OWNED BY public.medicine_order_items.id;


--
-- Name: medicine_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicine_orders (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    appointment_id integer,
    appointment_type character varying(10) DEFAULT 'online'::character varying NOT NULL,
    status character varying(50) DEFAULT 'submitted'::character varying NOT NULL,
    delivery_address text NOT NULL,
    phone character varying(20) NOT NULL,
    tracking_number character varying(255),
    pharmacist_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medicine_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicine_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicine_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicine_orders_id_seq OWNED BY public.medicine_orders.id;


--
-- Name: online_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_appointments (
    id integer NOT NULL,
    slot_id integer NOT NULL,
    patient_id integer NOT NULL,
    reason text,
    documents json DEFAULT '[]'::json NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    meeting_link text,
    join_enabled boolean DEFAULT false NOT NULL,
    join_enabled_at timestamp without time zone,
    patient_joined_at timestamp without time zone,
    livekit_room_name character varying(255),
    guest_token text
);


--
-- Name: online_appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.online_appointments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.online_appointments_id_seq OWNED BY public.online_appointments.id;


--
-- Name: online_slot_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_slot_sessions (
    id integer NOT NULL,
    date date NOT NULL,
    start_time character varying(5) NOT NULL,
    end_time character varying(5) NOT NULL,
    interval_minutes integer NOT NULL,
    max_bookings integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: online_slot_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.online_slot_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_slot_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.online_slot_sessions_id_seq OWNED BY public.online_slot_sessions.id;


--
-- Name: online_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_slots (
    id integer NOT NULL,
    session_id integer NOT NULL,
    date date NOT NULL,
    start_time character varying(5) NOT NULL,
    end_time character varying(5) NOT NULL,
    is_booked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: online_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.online_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: online_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.online_slots_id_seq OWNED BY public.online_slots.id;


--
-- Name: open_months; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_months (
    id integer NOT NULL,
    month character varying(7) NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: open_months_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.open_months_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: open_months_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.open_months_id_seq OWNED BY public.open_months.id;


--
-- Name: patient_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_documents (
    id integer NOT NULL,
    patient_id integer NOT NULL,
    name text NOT NULL,
    object_path text NOT NULL,
    content_type character varying(100) NOT NULL,
    size integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: patient_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_documents_id_seq OWNED BY public.patient_documents.id;


--
-- Name: patient_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_sessions (
    id integer NOT NULL,
    session_token text NOT NULL,
    patient_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: patient_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_sessions_id_seq OWNED BY public.patient_sessions.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    google_id character varying(255),
    name character varying(255) NOT NULL,
    phone character varying(20),
    address text,
    avatar_url text,
    password_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    patient_code character varying(4),
    verification_reminder_sent_at timestamp without time zone,
    verification_reminder_count integer DEFAULT 0 NOT NULL,
    verification_reminder_claimed_at timestamp without time zone,
    verification_reminder_last_attempt_at timestamp without time zone,
    verification_reminder_claim_id character varying(64),
    verification_reminder_pending_at timestamp without time zone,
    verification_reminder_pending_token_id integer,
    verification_reminder_dispatch_started_at timestamp without time zone
);


--
-- Name: patients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patients_id_seq OWNED BY public.patients.id;


--
-- Name: pharmacy_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_sessions (
    id integer NOT NULL,
    session_token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pharmacy_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pharmacy_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pharmacy_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pharmacy_sessions_id_seq OWNED BY public.pharmacy_sessions.id;


--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescriptions (
    id integer NOT NULL,
    online_appointment_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    photo_object_path text,
    notes text
);


--
-- Name: prescriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prescriptions_id_seq OWNED BY public.prescriptions.id;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id integer NOT NULL,
    testimonials_enabled boolean DEFAULT true NOT NULL,
    appointment_booking_enabled boolean DEFAULT true NOT NULL,
    clinic_phone1 character varying(20) DEFAULT '9492068180'::character varying NOT NULL,
    clinic_phone2 character varying(20),
    clinic_email character varying(255),
    clinic_address text DEFAULT '119, Ramulavari North Mada Street, Tirupati - 517 507'::text NOT NULL,
    working_hours character varying(255),
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    smtp_host character varying(255),
    smtp_port integer DEFAULT 587,
    smtp_user character varying(255),
    smtp_pass character varying(255),
    smtp_secure boolean DEFAULT false NOT NULL,
    smtp_from_name character varying(255) DEFAULT 'Susruta Hospital'::character varying NOT NULL,
    smtp_from_email character varying(255) DEFAULT 'noreply@susrutahospital.com'::character varying NOT NULL,
    smtp_subscriber_from character varying(255) DEFAULT 'updates@susrutahospital.com'::character varying NOT NULL,
    doctor_password_hash character varying(255),
    pharmacy_password_hash character varying(255),
    phonepe_qr_object_path character varying(500),
    meeting_link text,
    patient_id_prefix character varying(1) DEFAULT 'A'::character varying NOT NULL,
    patient_id_current_number integer DEFAULT 0 NOT NULL
);


--
-- Name: site_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.site_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: site_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.site_settings_id_seq OWNED BY public.site_settings.id;


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    email character varying(255) NOT NULL,
    subscribed_at timestamp without time zone DEFAULT now() NOT NULL,
    country character varying(100),
    unsubscribed boolean DEFAULT false NOT NULL,
    unsubscribed_at timestamp without time zone,
    unsubscribe_reason text
);


--
-- Name: subscribers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscribers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscribers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscribers_id_seq OWNED BY public.subscribers.id;


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id integer NOT NULL,
    patient_name character varying(255) NOT NULL,
    patient_location character varying(255),
    content text NOT NULL,
    content_te text,
    rating integer DEFAULT 5 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: testimonials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.testimonials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: testimonials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.testimonials_id_seq OWNED BY public.testimonials.id;


--
-- Name: admin_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions ALTER COLUMN id SET DEFAULT nextval('public.admin_sessions_id_seq'::regclass);


--
-- Name: appointments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ALTER COLUMN id SET DEFAULT nextval('public.appointments_id_seq'::regclass);


--
-- Name: blocked_dates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_dates ALTER COLUMN id SET DEFAULT nextval('public.blocked_dates_id_seq'::regclass);


--
-- Name: direct_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_calls ALTER COLUMN id SET DEFAULT nextval('public.direct_calls_id_seq'::regclass);


--
-- Name: doctor_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_sessions ALTER COLUMN id SET DEFAULT nextval('public.doctor_sessions_id_seq'::regclass);


--
-- Name: donations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations ALTER COLUMN id SET DEFAULT nextval('public.donations_id_seq'::regclass);


--
-- Name: login_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens ALTER COLUMN id SET DEFAULT nextval('public.login_tokens_id_seq'::regclass);


--
-- Name: medicine_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_order_items ALTER COLUMN id SET DEFAULT nextval('public.medicine_order_items_id_seq'::regclass);


--
-- Name: medicine_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_orders ALTER COLUMN id SET DEFAULT nextval('public.medicine_orders_id_seq'::regclass);


--
-- Name: online_appointments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_appointments ALTER COLUMN id SET DEFAULT nextval('public.online_appointments_id_seq'::regclass);


--
-- Name: online_slot_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_slot_sessions ALTER COLUMN id SET DEFAULT nextval('public.online_slot_sessions_id_seq'::regclass);


--
-- Name: online_slots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_slots ALTER COLUMN id SET DEFAULT nextval('public.online_slots_id_seq'::regclass);


--
-- Name: open_months id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_months ALTER COLUMN id SET DEFAULT nextval('public.open_months_id_seq'::regclass);


--
-- Name: patient_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents ALTER COLUMN id SET DEFAULT nextval('public.patient_documents_id_seq'::regclass);


--
-- Name: patient_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_sessions ALTER COLUMN id SET DEFAULT nextval('public.patient_sessions_id_seq'::regclass);


--
-- Name: patients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients ALTER COLUMN id SET DEFAULT nextval('public.patients_id_seq'::regclass);


--
-- Name: pharmacy_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sessions ALTER COLUMN id SET DEFAULT nextval('public.pharmacy_sessions_id_seq'::regclass);


--
-- Name: prescriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions ALTER COLUMN id SET DEFAULT nextval('public.prescriptions_id_seq'::regclass);


--
-- Name: site_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings ALTER COLUMN id SET DEFAULT nextval('public.site_settings_id_seq'::regclass);


--
-- Name: subscribers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers ALTER COLUMN id SET DEFAULT nextval('public.subscribers_id_seq'::regclass);


--
-- Name: testimonials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials ALTER COLUMN id SET DEFAULT nextval('public.testimonials_id_seq'::regclass);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: blocked_dates blocked_dates_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_dates
    ADD CONSTRAINT blocked_dates_date_unique UNIQUE (date);


--
-- Name: blocked_dates blocked_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_dates
    ADD CONSTRAINT blocked_dates_pkey PRIMARY KEY (id);


--
-- Name: direct_calls direct_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_calls
    ADD CONSTRAINT direct_calls_pkey PRIMARY KEY (id);


--
-- Name: direct_calls direct_calls_room_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_calls
    ADD CONSTRAINT direct_calls_room_name_unique UNIQUE (room_name);


--
-- Name: doctor_sessions doctor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_sessions
    ADD CONSTRAINT doctor_sessions_pkey PRIMARY KEY (id);


--
-- Name: doctor_sessions doctor_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_sessions
    ADD CONSTRAINT doctor_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: donations donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_pkey PRIMARY KEY (id);


--
-- Name: login_tokens login_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_tokens
    ADD CONSTRAINT login_tokens_token_unique UNIQUE (token);


--
-- Name: medicine_order_items medicine_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_order_items
    ADD CONSTRAINT medicine_order_items_pkey PRIMARY KEY (id);


--
-- Name: medicine_orders medicine_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_orders
    ADD CONSTRAINT medicine_orders_pkey PRIMARY KEY (id);


--
-- Name: online_appointments online_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_appointments
    ADD CONSTRAINT online_appointments_pkey PRIMARY KEY (id);


--
-- Name: online_slot_sessions online_slot_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_slot_sessions
    ADD CONSTRAINT online_slot_sessions_pkey PRIMARY KEY (id);


--
-- Name: online_slots online_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_slots
    ADD CONSTRAINT online_slots_pkey PRIMARY KEY (id);


--
-- Name: open_months open_months_month_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_months
    ADD CONSTRAINT open_months_month_unique UNIQUE (month);


--
-- Name: open_months open_months_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_months
    ADD CONSTRAINT open_months_pkey PRIMARY KEY (id);


--
-- Name: patient_documents patient_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_pkey PRIMARY KEY (id);


--
-- Name: patient_sessions patient_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_sessions
    ADD CONSTRAINT patient_sessions_pkey PRIMARY KEY (id);


--
-- Name: patient_sessions patient_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_sessions
    ADD CONSTRAINT patient_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: patients patients_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_email_unique UNIQUE (email);


--
-- Name: patients patients_google_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_google_id_unique UNIQUE (google_id);


--
-- Name: patients patients_patient_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_patient_code_unique UNIQUE (patient_code);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_sessions pharmacy_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sessions
    ADD CONSTRAINT pharmacy_sessions_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_sessions pharmacy_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_sessions
    ADD CONSTRAINT pharmacy_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: prescriptions prescriptions_online_appointment_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_online_appointment_id_unique UNIQUE (online_appointment_id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_email_unique UNIQUE (email);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;


--
-- Name: direct_calls direct_calls_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_calls
    ADD CONSTRAINT direct_calls_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: donations donations_appointment_id_online_appointments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_appointment_id_online_appointments_id_fk FOREIGN KEY (appointment_id) REFERENCES public.online_appointments(id) ON DELETE SET NULL;


--
-- Name: donations donations_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.donations
    ADD CONSTRAINT donations_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: medicine_order_items medicine_order_items_order_id_medicine_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_order_items
    ADD CONSTRAINT medicine_order_items_order_id_medicine_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.medicine_orders(id);


--
-- Name: medicine_orders medicine_orders_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine_orders
    ADD CONSTRAINT medicine_orders_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: online_appointments online_appointments_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_appointments
    ADD CONSTRAINT online_appointments_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: online_appointments online_appointments_slot_id_online_slots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_appointments
    ADD CONSTRAINT online_appointments_slot_id_online_slots_id_fk FOREIGN KEY (slot_id) REFERENCES public.online_slots(id);


--
-- Name: online_slots online_slots_session_id_online_slot_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_slots
    ADD CONSTRAINT online_slots_session_id_online_slot_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.online_slot_sessions(id) ON DELETE CASCADE;


--
-- Name: patient_documents patient_documents_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_documents
    ADD CONSTRAINT patient_documents_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_sessions patient_sessions_patient_id_patients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_sessions
    ADD CONSTRAINT patient_sessions_patient_id_patients_id_fk FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: prescriptions prescriptions_online_appointment_id_online_appointments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_online_appointment_id_online_appointments_id_fk FOREIGN KEY (online_appointment_id) REFERENCES public.online_appointments(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Xem6nCcdBS7846xX9VTlNt5vnObiQFL4FrzA7WI7efzwuAczrTSegMF4WMyId0y

