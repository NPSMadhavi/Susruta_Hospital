import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const STATIC_PAGE_PREFIXES = ["/treatments/", "/conditions/"];

function isStaticPagePath(pathname: string) {
  return STATIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default function NotFound() {
  useEffect(() => {
    const pathname = window.location.pathname;
    if (isStaticPagePath(pathname)) {
      const target = pathname.endsWith("/")
        ? pathname + "index.html"
        : pathname + "/index.html";
      window.location.replace(target);
    }
  }, []);

  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  if (isStaticPagePath(pathname)) {
    return null;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
