import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TRIPWIRE_LOGO } from "@tripwire/core";
import { BrandMark } from "./Brand";
export function NavBar() {
  return <header className="product-nav"><div className="product-nav-inner"><Link href="/" className="product-brand" aria-label="Tripwire home"><BrandMark logo={TRIPWIRE_LOGO} size={28} />tripwire<span className="brand-period">.</span></Link><nav aria-label="Main navigation"><a href="/#in-action">In action</a><a href="/#features">The extension</a><a href="/#faq">FAQs</a></nav><a className="nav-install" href="/#install">Get extension <ArrowUpRight size={16} aria-hidden="true" /></a></div></header>;
}
