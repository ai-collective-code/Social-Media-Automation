import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import ThemeScript from "@/components/ThemeScript";
import { listBrands } from "@/lib/brand-store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Automation Platform",
  description:
    "Social media automation pipeline: strategy, creative, execution, QC, publishing.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Fetched here so the brand switcher is available in the shell on every page.
  const brands = await listBrands();

  return (
    // suppressHydrationWarning: ThemeScript sets data-theme during parsing,
    // before React hydrates, so the DOM legitimately differs from the payload.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="bg-canvas text-fg">
        <AppShell brands={brands}>{children}</AppShell>
      </body>
    </html>
  );
}
