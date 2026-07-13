import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Holoplax | Agile OS for Life Work",
  description:
    "Personal agile system with velocity, backlog automation, and AI readiness for your life sprints.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
