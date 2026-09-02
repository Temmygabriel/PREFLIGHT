import './globals.css';

export const metadata = {
  title: 'Preflight — clear your trade for takeoff',
  description:
    'Before an agent moves your money, Preflight runs the checklist: price, order book, volume, funding — computed in code, never guessed.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
