import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Blair Lawn Care",
  description: "Blair Lawn Care operations dashboard",
  // iOS ignores the web manifest when you add a site to the home screen and
  // reads these tags instead, so the name and icon have to be stated twice.
  appleWebApp: {
    capable: true,
    title: "Blair Lawn",
    // Dark bar with light text, to carry on from the header underneath it.
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a2e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
