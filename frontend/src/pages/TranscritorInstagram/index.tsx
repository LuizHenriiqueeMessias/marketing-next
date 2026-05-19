import { Link } from "lucide-react";
import TranscritorBatch from "@/components/TranscritorBatch";

export default function TranscritorInstagram() {
  return (
    <TranscritorBatch
      platform="instagram"
      validateUrl={(url) => url.includes("instagram.com")}
      headerIcon={<Link className="w-[18px] h-[18px]" style={{ color: "#a855f7" }} />}
      headerTitle="Transcritor Instagram"
      headerSub="Transcreva multiplos videos do Instagram e gere roteiros para teleprompter"
      accentColor="#a855f7"
      contentMaxWidthClassName="max-w-[980px]"
      centerContent
    />
  );
}
