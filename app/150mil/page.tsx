import type { Metadata } from "next";
import CelebrationScreen from "@/components/celebration-screen";

export const metadata: Metadata = {
  title: "150 mil no TikTok · Rede Câmara",
  description: "Comemoração dos 150 mil seguidores da Câmara dos Deputados no TikTok.",
};

export default function TikTokCelebrationPage() {
  return <CelebrationScreen network="tiktok" />;
}
