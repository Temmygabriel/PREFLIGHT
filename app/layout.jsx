import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Two typefaces only — Archivo (UI / signage feel) and IBM Plex Mono (reserved
// for literal data: docket numbers, values, timestamps). Both free from Google
// Fonts; fetched at build time by the cloud builder.
const archivo = Archivo({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-archivo',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex',
});

export const metadata = {
  title: 'Preflight — verify before you act',
  description:
    'The pre-flight checklist for your trades. Before an agent moves your money, Preflight reads the market, runs the checklist (price, order book, volume, funding), and stamps a verdict — computed in code, never guessed.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
