import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWAProvider } from "@/components/providers/PWAProvider";

export const metadata: Metadata = {
  title: "PG Manager | The Layout Office",
  description: "Enterprise-Grade Multi-Tenant PG & Hostel Management Platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PG Manager",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PWAProvider>{children}</PWAProvider>
      </body>
    </html>
  );
}
