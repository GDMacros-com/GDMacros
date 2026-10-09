import { notFound } from "next/navigation";
import BotPanel from "@/components/admin/bot/BotPanel";
import TranscriptView from "@/components/admin/bot/TranscriptView";
import { BOT_MODULES } from "@/lib/bot/types";

export default async function BotSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (/^transcript-[1-9][0-9]{0,9}$/.test(section))
    return <TranscriptView number={Number(section.slice(11))} />;
  if (section !== "cases" && !BOT_MODULES.some((m) => m.key === section))
    notFound();
  return <BotPanel section={section} />;
}
