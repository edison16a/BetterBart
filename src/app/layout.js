import "./globals.css";

const ICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='24' fill='%230079C1'/><circle cx='50' cy='50' r='24' fill='none' stroke='white' stroke-width='12'/></svg>";

export const metadata = {
  title: "BetterBART",
  description: "A simple BART map, live departures, and trip planner.",
  icons: { icon: ICON },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Provides document metadata and global styles for the BetterBART application.
 *
 * @param {{ children: React.ReactNode }} props
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
