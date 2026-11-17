"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SocialCelebration from "@/components/social-celebration";
import type { CelebrationNetwork } from "@/components/social-celebration";

export default function CelebrationScreen({ network = "instagram" }: { network?: CelebrationNetwork }) {
  const router = useRouter();
  const [viewport, setViewport] = useState({ scale: 1, mobile: false });
  const returnToPanel = useCallback(() => router.push("/"), [router]);

  useEffect(() => {
    const resize = () => setViewport({
      scale: Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
      mobile: window.innerWidth < 800,
    });
    const keyboard = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat &&
          event.key.toLowerCase() === "c") returnToPanel();
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keyboard);
    };
  }, [returnToPanel]);

  return (
    <main className="screen">
      <div className="stage-wrapper" style={viewport.mobile ? undefined : {
        width: 1920 * viewport.scale,
        height: 1080 * viewport.scale,
      }}>
        <div className="stage" style={viewport.mobile ? undefined : {
          transform: `scale(${viewport.scale})`,
        }}>
          <SocialCelebration network={network} onClose={returnToPanel} />
        </div>
      </div>
    </main>
  );
}
