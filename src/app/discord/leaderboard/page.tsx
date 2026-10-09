import type { Metadata } from "next";
import CommunityLeaderboard from "@/components/CommunityLeaderboard";
export const metadata: Metadata = {
  title: "Community leaderboard",
  description: "Explore the GDM Community Discord leveling leaderboard.",
};
export default function LeaderboardPage() {
  return <CommunityLeaderboard />;
}
