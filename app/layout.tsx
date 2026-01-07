import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}

