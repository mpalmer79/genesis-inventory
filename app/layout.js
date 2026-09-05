import './globals.css';

export const metadata = {
  title: 'Genesis Inventory Intelligence',
  description: 'Fast inventory search and sales intelligence for Genesis of Manchester.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
