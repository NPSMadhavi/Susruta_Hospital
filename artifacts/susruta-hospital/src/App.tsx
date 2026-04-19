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
import AdminOnlineAppointments from "./pages/admin/online-appointments";
import AdminPatients from "./pages/admin/patients";

// Patient Portal Pages
import PortalLogin from "./pages/portal/login";
import PatientDashboard from "./pages/portal/dashboard";
import PortalBook from "./pages/portal/book";
import OnlineBook from "./pages/portal/online-book";

// Legal Pages
import MedicalDisclaimer from "./pages/medical-disclaimer";
import TermsAndConditions from "./pages/terms";
import PrivacyPolicy from "./pages/privacy-policy";

// Doctor Portal Pages
import DoctorLogin from "./pages/doctor/login";
import DoctorAppointments from "./pages/doctor/appointments";

// Guest Video Call
import GuestCall from "./pages/guest-call";

// Pharmacy Portal Pages (hidden — enable from code when needed)
// import PharmacyLogin from "./pages/pharmacy/login";
// import PharmacyOrders from "./pages/pharmacy/orders";

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

      {/* Legal Pages */}
      <Route path="/medical-disclaimer" component={MedicalDisclaimer} />
      <Route path="/terms" component={TermsAndConditions} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />

      {/* Patient Portal Routes */}
      <Route path="/portal" component={PortalLogin} />
      <Route path="/portal/dashboard" component={PatientDashboard} />
      <Route path="/portal/book" component={PortalBook} />
      <Route path="/portal/online-book" component={OnlineBook} />

      {/* Guest Video Call — public, no auth required */}
      <Route path="/guest-call/:apptId" component={GuestCall} />

      {/* Doctor Portal Routes */}
      <Route path="/doctor" component={DoctorLogin} />
      <Route path="/doctor/appointments" component={DoctorAppointments} />

      {/* Pharmacy Portal Routes — hidden, enable from code when needed */}
      {/* <Route path="/pharmacy" component={PharmacyLogin} /> */}
      {/* <Route path="/pharmacy/orders" component={PharmacyOrders} /> */}

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/appointments" component={AdminAppointments} />
      <Route path="/admin/availability" component={AdminAvailability} />
      <Route path="/admin/testimonials" component={AdminTestimonials} />
      <Route path="/admin/subscribers" component={AdminSubscribers} />
      <Route path="/admin/online-slots" component={AdminOnlineSlots} />
      <Route path="/admin/online-appointments" component={AdminOnlineAppointments} />
      <Route path="/admin/patients" component={AdminPatients} />
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
