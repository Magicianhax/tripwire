import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
import "./product.css";
import "./hero.css";
import "./showcase.css";
import { NANSEN_LOGO, TRIPWIRE_LOGO } from "@tripwire/core";
import { BrandMark } from "./_components/Brand";
import { NavBar } from "./_components/NavBar";

export const metadata: Metadata = {
  title: "Tripwire — Onchain context, where you trade",
  description: "Bring Nansen wallet, token and perp intelligence to X and the trading sites you already use. Explore Tripwire for Chrome.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="product-skip" href="#main-content">Skip to content</a>
        <NavBar />
        <main className="tw-main product-main" id="main-content">
          <div className="tw-container">{children}</div>
        </main>
        <footer className="tw-footer">
          <div className="tw-container tw-footer-row">
            <span className="product-attribution"><BrandMark logo={TRIPWIRE_LOGO} size={20} /> Tripwire · Context before conviction.</span>
            <span className="product-attribution">Powered by <BrandMark logo={NANSEN_LOGO} size={16} /> <span className="tw-powered-name">Nansen</span></span>
          </div>
        </footer>
      </body>
    </html>
  );
}
