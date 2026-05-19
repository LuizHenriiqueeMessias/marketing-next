import TranscritorBatch from "@/components/TranscritorBatch";
import { Youtube } from "lucide-react";

function isYouTubeUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith("youtube.com") || hostname === "youtu.be";
  } catch {
    return false;
  }
}

export default function Transcritor() {
  return (
    <TranscritorBatch
      platform="youtube"
      validateUrl={isYouTubeUrl}
      headerIcon={<Youtube className="w-[18px] h-[18px]" style={{ color: "#ff0000" }} />}
      headerTitle="Transcritor YouTube"
      headerSub="Transcreva multiplos videos do YouTube e gere roteiros para teleprompter"
      accentColor="#ff0000"
      contentMaxWidthClassName="max-w-[760px]"
      centerContent
    />
  );
}
