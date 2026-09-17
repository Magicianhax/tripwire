import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";
import { isReplay } from "@/lib/nansen/client";
import { NavBar } from "./_components/NavBar";

export const metadata: Metadata = {
  title: "Tripwire",
  description: "Local backend for the Tripwire extension: rules, Nansen call ledger and override history.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar replay={isReplay()} />
        <main className="tw-main">
          <div className="tw-container">{children}</div>
        </main>
      </body>
    </html>
  );
}
