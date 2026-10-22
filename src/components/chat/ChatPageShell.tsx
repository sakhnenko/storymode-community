import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { StoryModeLogo } from "@/components/brand/StoryModeLogo";

/** Full-page painting backdrop with the logo, for the conversational flows. */
export function ChatPageShell({ logoHref, logoLabel, onLogoClick, children }: { logoHref: string; logoLabel: string; onLogoClick?: (e: MouseEvent<HTMLAnchorElement>) => void; children: ReactNode }) {
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  return (
    <div className="relative min-h-dvh">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${background.url})` }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-black/55" />
        <div className="hidden sm:block">
          <BackgroundCredit background={background} />
        </div>
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        <Link to={logoHref} aria-label={logoLabel} onClick={onLogoClick}>
          <StoryModeLogo markClassName="h-8 w-8" wordmarkClassName="text-3xl text-white" />
        </Link>
      </header>

      <main className="relative z-10">{children}</main>
    </div>
  );
}
