import type { Metadata } from 'next';
import {
  JetBrains_Mono,
  Plus_Jakarta_Sans,
  Saira_Condensed,
} from 'next/font/google';
import './globals.css';

const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-agency-fallback',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ASCII Typographic Cube — MAKE WORK FEEL EASY',
  description:
    'Interactive Three.js 3D typographic cube rendered in real-time ASCII with Agency FB lettering and standalone HTML export.',
  openGraph: {
    title: 'ASCII Typographic Cube — MAKE WORK FEEL EASY',
    description:
      'Interactive Three.js 3D typographic cube rendered in real-time ASCII with Agency FB lettering and standalone HTML export.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASCII Typographic Cube — MAKE WORK FEEL EASY',
    description:
      'Interactive Three.js 3D typographic cube rendered in real-time ASCII with Agency FB lettering and standalone HTML export.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sairaCondensed.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        suppressHydrationWarning
        className="bg-black text-[#ff0000] font-sans antialiased overflow-hidden selection:bg-[#ff0000]/30 selection:text-[#ff0000]"
      >
        {children}
      </body>
    </html>
  );
}
