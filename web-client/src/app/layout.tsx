import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { ToastHost } from "@/components/ui";

/*
  The same font scale the Flutter client uses (LdTypography).
  - Plus Jakarta Sans: Vietnamese (vi)
  - Space Grotesk: Latin / English (en)
  - IBM Plex Sans Arabic: Arabic (ar)
*/
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Local Drive",
  description: "Your own file server, on your own hardware.",
};

export const viewport: Viewport = {
  themeColor: "#141414",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" dir="ltr" data-theme="dark">
      <body className={`${spaceGrotesk.variable} ${plexArabic.variable} ${plusJakarta.variable}`}>
        <ThemeProvider>
          <SessionProvider>
            <ToastHost>{children}</ToastHost>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
