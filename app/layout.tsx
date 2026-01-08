import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./lib/auth-context";

export const metadata: Metadata = {
  title: "Entrepreneur Demand & Trend Intelligence System",
  description: "Discover what entrepreneurs are searching for and detect rising demand",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

