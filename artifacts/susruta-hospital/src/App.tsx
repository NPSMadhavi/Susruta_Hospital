import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Single public page
import Home from "./pages/home";
import Appointments from "./pages/appointments";

// Admin Pages
import AdminLogin from "./pages/admin/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminAppointments from "./pages/admin/appointments";
import AdminAvailability from "./pages/admin/availability";
import AdminTestimonials from "./pages/admin/testimonials";
import AdminSettings from "./pages/admin/settings";
import AdminSubscribers from "./pages/admin/subscribers";
import AdminOnlineSlots from "./pages/admin/online-slots";

// Patient Portal Pages
import PortalLogin from "./pages/portal/login";
import PatientDashboard from "./pages/portal/dashboard";
import PortalBook from "./pages/portal/book";
import OnlineBook from "./pages/portal/online-book";

// Doctor Portal Pages
import DoctorLogin from "./pages/doctor/login";
import DoctorAppointments from "./pages/doctor/appointments";

// Pharmacy Portal Pages
import PharmacyLogin from "./pages/pharmacy/login";
import PharmacyOrders from "./pages/pharmacy/orders";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Single-page public website */}
      <Route path="/" component={Home} />
      <Route path="/appointments" component={Appointments} />

      {/* Patient Portal Routes */}
      <Route path="/portal" component={PortalLogin} />
      <Route path="/portal/dashboard" component={PatientDashboard} />
      <Route path="/portal/book" component={PortalBook} />
      <Route path="/portal/online-book" component={OnlineBook} />

      {/* Doctor Portal Routes */}
      <Route path="/doctor" component={DoctorLogin} />
      <Route path="/doctor/appointments" component={DoctorAppointments} />

      {/* Pharmacy Portal Routes */}
      <Route path="/pharmacy" component={PharmacyLogin} />
      <Route path="/pharmacy/orders" component={PharmacyOrders} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/appointments" component={AdminAppointments} />
      <Route path="/admin/availability" component={AdminAvailability} />
      <Route path="/admin/testimonials" component={AdminTestimonials} />
      <Route path="/admin/subscribers" component={AdminSubscribers} />
      <Route path="/admin/online-slots" component={AdminOnlineSlots} />
      <Route path="/admin/settings" component={AdminSettings} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
