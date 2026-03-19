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
  googleStatus: (): Promise<{ enabled: boolean }> =>
    req("/auth/google/status"),

  register: (body: { name: string; email: string; phone?: string; password: string }) =>
    req("/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    req("/login", { method: "POST", body: JSON.stringify(body) }),

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
