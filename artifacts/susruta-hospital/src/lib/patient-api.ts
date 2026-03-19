const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api/patient`;

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const patientApi = {
  requestMagicLink: (body: { email: string; name?: string; phone?: string; next?: string }) =>
    req("/auth/request", { method: "POST", body: JSON.stringify(body) }),

  logout: () => req("/logout", { method: "POST" }),

  me: () => req("/me"),

  getAppointments: () => req("/appointments"),

  bookAppointment: (body: { date: string; timeSlot: string; reason?: string; patientName: string; patientPhone: string }) =>
    req("/appointments", { method: "POST", body: JSON.stringify(body) }),

  confirmFollowup: (id: number) =>
    req(`/appointments/${id}/confirm-followup`, { method: "PATCH" }),

  chooseReschedule: (id: number, chosenDate: string) =>
    req(`/appointments/${id}/choose-reschedule`, { method: "PATCH", body: JSON.stringify({ chosenDate }) }),
};
