import './globals.css';
import './hero-overrides.css';

export const metadata = {
  title: 'Genesis Inventory Intelligence',
  description: 'Fast inventory search and sales intelligence for Genesis of Manchester.',
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
