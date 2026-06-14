import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "InfraSight",
  description: "Hybrid infrastructure operations console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
