import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { FloatingVerse } from "@/components/shared/floating-verse";
import { getSiteSettings } from "@/lib/data/site";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getSiteSettings();
  return {
    metadataBase: new URL("https://zubidayfc.org"),
    title: {
      default: `${site.name} — ${site.tagline}`,
      template: `%s — ${site.name}`,
    },
    description: site.description,
    keywords: [
      "Youth for Christ",
      "YFC",
      "Zamboanga del Sur",
      "Zubida",
      "Catholic youth",
      "Philippines",
    ],
    openGraph: {
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
      type: "website",
      locale: "en_PH",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#12224E",
};

// Prevent theme flash before hydration
const themeScript = `
(function(){try{var t=localStorage.getItem('zubida-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { site, navLinks } = await getSiteSettings();
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <LoadingScreen />
          <Navbar site={site} navLinks={navLinks} />
          <main>{children}</main>
          <Footer site={site} navLinks={navLinks} />
          <FloatingVerse />
        </ThemeProvider>
      </body>
    </html>
  );
}
