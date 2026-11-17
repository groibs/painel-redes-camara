import type { Metadata } from "next";
import CelebrationScreen from "@/components/celebration-screen";

export const metadata: Metadata = {
  title: "400 mil no Instagram · Rede Câmara",
  description: "Comemoração dos 400 mil seguidores da Câmara dos Deputados no Instagram.",
};

export default function CelebrationPage() {
  return <CelebrationScreen />;
}
