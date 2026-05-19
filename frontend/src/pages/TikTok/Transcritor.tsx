import TranscritorBatch from "@/components/TranscritorBatch";
import { Music2 } from "lucide-react";

function isTikTokUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith("tiktok.com");
  } catch {
    return false;
  }
}

export default function Transcritor() {
  return (
    <TranscritorBatch
      platform="tiktok"
      validateUrl={isTikTokUrl}
      headerIcon={<Music2 className="w-[18px] h-[18px]" style={{ color: "#00f2ea" }} />}
      headerTitle="Transcritor TikTok"
      headerSub="Transcreva multiplos videos do TikTok e gere roteiros para teleprompter"
      accentColor="#00f2ea"
      contentMaxWidthClassName="max-w-[760px]"
      centerContent
    />
  );
}
