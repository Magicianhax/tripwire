import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import { NANSEN_LOGO } from "@tripwire/core";
import { isReplay } from "@/lib/nansen/client";
import { BrandMark } from "./_components/Brand";
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
        <footer className="tw-footer">
          <div className="tw-container tw-footer-row">
            Powered by <BrandMark logo={NANSEN_LOGO} size={16} /> <span className="tw-powered-name">Nansen</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
