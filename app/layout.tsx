import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "FinancyBoss",
  description: "Ordená tu plata: ahorro, gasto e inversión en un solo lugar.",
};

// Se aplica antes de que React hidrate, para no parpadear entre claro/oscuro
// al cargar. Por defecto (sin nada guardado) siempre arranca en claro — la
// app NO sigue la preferencia del sistema operativo, solo lo que el usuario
// eligió a mano con el switch (ver ThemeToggle.tsx).
const themeInitScript = `
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* next/script con "beforeInteractive": un <script> suelto acá
            genera el warning "Encountered a script tag while rendering
            React component" en React 19 / Next 16 — este es el mecanismo
            soportado para inyectar un script que corre antes de hidratar. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
