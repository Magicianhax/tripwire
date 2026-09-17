import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/archivo/standard.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { NavBar } from "./_components/NavBar";

export const metadata: Metadata = {
  title: "Tripwire",
  description: "Industrial safety signage for onchain trading: silent until there is danger.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main className="tw-main">
          <div className="tw-container">{children}</div>
        </main>
      </body>
    </html>
  );
}
