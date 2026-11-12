import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cormorant = localFont({
  src: "../../assets/fonts/CormorantGaramond-wght.ttf",
  variable: "--font-cormorant",
  display: "swap",
  weight: "300 700",
});
const inter = localFont({
  src: "../../assets/fonts/Inter-opsz-wght.ttf",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Dear Swritsinh",
  description: "A private family archive.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // Deliberately no Open Graph images: nothing private may leak into link previews.
  openGraph: null,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Dear Swritsinh", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#101A2B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
