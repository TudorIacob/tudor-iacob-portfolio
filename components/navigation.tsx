"use client";
import Link from "next/link";
import { Monogram } from "@/components/monogram";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Github, Linkedin, Menu, X } from "lucide-react";
export function Navigation({
  links,
  github,
  linkedin,
}: {
  links: { label: string; anchor: string }[];
  github: string;
  linkedin: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 24);
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);
  return (
    <header
      className={`navigation ${scrolled ? "scrolled" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <div className="container nav-inner">
        <Link
          href="/#top"
          className="wordmark"
          aria-label="Tudor Iacob home"
          onClick={() => setOpen(false)}
        >
          <Monogram />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((n) => (
            <a key={n.anchor} href={`/#${n.anchor}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="social-icon" href={github} aria-label="GitHub">
            <Github size={18} />
          </a>
          <a className="social-icon" href={linkedin} aria-label="LinkedIn">
            <Linkedin size={18} />
          </a>
          <Link className="button small" href="/#contact">
            Let&apos;s Talk <ArrowUpRight size={15} />
          </Link>
          <button
            ref={button}
            className="icon-button menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          className="mobile-nav container"
          aria-label="Mobile navigation"
        >
          {links.map((n) => (
            <a
              key={n.anchor}
              href={`/#${n.anchor}`}
              onClick={() => {
                setOpen(false);
                const target = document.getElementById(n.anchor);
                if (target) {
                  target.tabIndex = -1;
                  target.focus({ preventScroll: true });
                }
              }}
            >
              {n.label}
              <ArrowUpRight size={16} />
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
