import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Public Pages
import Home from "./pages/home";
import About from "./pages/about";
import Achievements from "./pages/achievements";
import Services from "./pages/services";
import Appointments from "./pages/appointments";
import Testimonials from "./pages/testimonials";
import Contact from "./pages/contact";

// Admin Pages
import AdminLogin from "./pages/admin/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminAppointments from "./pages/admin/appointments";
import AdminAvailability from "./pages/admin/availability";
import AdminTestimonials from "./pages/admin/testimonials";
import AdminSettings from "./pages/admin/settings";

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
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/achievements" component={Achievements} />
      <Route path="/services" component={Services} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/testimonials" component={Testimonials} />
      <Route path="/contact" component={Contact} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/appointments" component={AdminAppointments} />
      <Route path="/admin/availability" component={AdminAvailability} />
      <Route path="/admin/testimonials" component={AdminTestimonials} />
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
