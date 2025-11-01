import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

const mono = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "AI Caller ID – Ontmasker onbekende nummers",
  description:
    "Laat een AI-assistent onbekende nummers bellen, identificeer wie er opneemt en ontdek transcripties in een publieke database."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
