import MacroDetailPage, { macroMetadata } from "@/components/MacroDetailPage";
import { getAllLevels } from "@/lib/macros";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllLevels(true).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  return macroMetadata((await params).slug, true);
}

export default async function LegacyMacroPage({ params }: Props) {
  return <MacroDetailPage slug={(await params).slug} legacy />;
}
