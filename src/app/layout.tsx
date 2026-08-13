import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { StandaloneViewport } from "@/components/standalone-viewport";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fridge — your kitchen",
  description: "See what's in your kitchen, what needs eating, and scan the shopping in.",
  manifest: "/manifest.webmanifest",
  applicationName: "Fridge",
  appleWebApp: {
    capable: true,
    title: "Fridge",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Cover lets the app paint under the notch and home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121815" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors closeButton={false} />
          <StandaloneViewport />
        </ThemeProvider>
      </body>
    </html>
  );
}
