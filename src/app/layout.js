import "./globals.css";

export const metadata = {
  title: "BetterBART",
  description: "A simple BART map, live departures, and trip planner.",
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
