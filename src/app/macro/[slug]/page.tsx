import MacroDetailPage, { macroMetadata } from "@/components/MacroDetailPage";
import { getAllLevels, getLevelBySlug } from "@/lib/macros";
import { redirect } from "next/navigation";
import { macroPath } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return [...new Set([...getAllLevels(), ...getAllLevels(true)].map(({ slug }) => slug))]
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  return macroMetadata((await params).slug);
}

export default async function MacroPage({ params }: Props) {
  const { slug } = await params;
  if (!getLevelBySlug(slug) && getLevelBySlug(slug, true)) redirect(macroPath(slug, true));
  return <MacroDetailPage slug={slug} />;
}
