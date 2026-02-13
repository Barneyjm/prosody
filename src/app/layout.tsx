import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prosody — Write music in plain text",
  description:
    "A web app where each line of text is a simultaneous track. Compose music using a simple note language.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
