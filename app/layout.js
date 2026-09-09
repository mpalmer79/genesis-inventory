import './globals.css';
import './hero-overrides.css';
import './silver-depth-overrides.css';

const title = 'Genesis Inventory Intelligence';
const description = 'Live inventory search for Genesis of Manchester.';
const siteUrl = 'https://genesis-manchester.vercel.app';
const socialImage = '/images/genesis-showroom-hero.webp';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: 'Genesis of Manchester',
    type: 'website',
    images: [
      {
        url: socialImage,
        width: 1536,
        height: 1024,
        alt: 'Genesis of Manchester showroom'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [socialImage]
  },
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
