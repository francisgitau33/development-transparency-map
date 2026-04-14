import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Development Transparency Map | Mapping Development. Enabling Transparency.",
  description: "A public geospatial platform for development projects worldwide. See who is implementing what, where.",
  keywords: ["development", "transparency", "geospatial", "projects", "NGO", "mapping"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable}>
      <head>
        <script
          data-design-ignore="true"
          dangerouslySetInnerHTML={{
            __html: `(function() {
  if (window === window.parent || window.__DESIGN_NAV_REPORTER__) return;
  window.__DESIGN_NAV_REPORTER__ = true;
  function report() {
    try { window.parent.postMessage({ type: 'IFRAME_URL_CHANGE', payload: { url: location.origin + location.pathname + location.hash } }, '*'); } catch(e) {}
  }
  report();
  var ps = history.pushState, rs = history.replaceState;
  history.pushState = function() { ps.apply(this, arguments); report(); };
  history.replaceState = function() { rs.apply(this, arguments); report(); };
  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);
  window.addEventListener('load', report);
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased font-sans">
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
