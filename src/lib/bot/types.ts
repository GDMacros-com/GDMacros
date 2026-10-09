export const BOT_MODULES = [
  {
    key: "boostnotifications",
    title: "Boost notifications",
    description: "Thank members who support the server.",
    symbol: "✦",
  },
  {
    key: "honeypot",
    title: "Honeypot",
    description: "Catch spam in a clearly marked trap channel.",
    symbol: "🍯",
  },
  {
    key: "moderation",
    title: "Moderation",
    description: "Commands, role permissions and detailed event logs.",
    symbol: "◇",
  },
  {
    key: "leveling",
    title: "Leveling",
    description: "XP, role rewards, rank cards and your leaderboard.",
    symbol: "↗",
  },
  {
    key: "tickets",
    title: "Tickets",
    description: "Private conversations, panels and transcripts.",
    symbol: "▤",
  },
  {
    key: "tempvoice",
    title: "Temporary voice",
    description: "Personal voice channels that clean up when empty.",
    symbol: "♪",
  },
] as const;
export type BotModule = (typeof BOT_MODULES)[number]["key"];
export type Embed = {
  title: string;
  description: string;
  color: string;
  footer: string;
  image: string;
};
export type CommandRule = {
  enabled: boolean;
  roles: string[];
  everyone: boolean;
};
export type LogRule = { enabled: boolean; channel_id: string | null };
export type Reward = { level: number; roles: string[]; stack: boolean };
export type TicketPanel = {
  id: string;
  name: string;
  enabled: boolean;
  channel_id: string;
  category_id: string;
  transcript_channel_id: string;
  staff_roles: string[];
  button_label: string;
  max_open_per_user: number;
  creator_can_close: boolean;
  ask_reason: boolean;
  embed: Embed;
  welcome: Embed;
};
export type BotSettings = {
  boostnotifications: {
    enabled: boolean;
    channel_id: string | null;
    embed: Embed;
  };
  honeypot: {
    enabled: boolean;
    channel_id: string | null;
    exempt_roles: string[];
    delete_seconds: number;
    embed: Embed;
  };
  moderation: {
    enabled: boolean;
    case_channel_id: string | null;
    commands: Record<string, CommandRule>;
    logs: Record<string, LogRule>;
    ignored_channels: string[];
  };
  leveling: {
    enabled: boolean;
    channel_mode: "all_except" | "only";
    channels: string[];
    threads: boolean;
    cooldown_seconds: number;
    min_xp: number;
    max_xp: number;
    slash_xp: boolean;
    coefficients: number[];
    blacklisted_roles: string[];
    ignored_prefixes: string[];
    champion_role_id: string | null;
    champion_excluded_roles: string[];
    notification_mode: "dm" | "same_channel" | "custom" | "none";
    notification_channel_id: string | null;
    notification_every: number;
    notification_min_level: number;
    notification_levels: number[];
    notify_rewards_only: boolean;
    notification_format: "embed" | "text";
    notification_embed: Embed;
    rewards: Reward[];
    reward_excluded_roles: string[];
    reassign_on_rejoin: boolean;
    reset_on_leave: boolean;
    reset_on_ban: boolean;
    rank_color: string;
    leaderboard_public: boolean;
  };
  tickets: { enabled: boolean; panels: TicketPanel[] };
  tempvoice: {
    enabled: boolean;
    lobby_id: string | null;
    category_id: string | null;
    user_limit: number;
  };
};
export type BotState = {
  revision: number;
  settings: BotSettings;
  status: {
    connected: boolean;
    guild_name: string;
    guild_id: string;
    latency_ms: number | null;
    problem: string | null;
    pending_logs: number;
    cases: number;
    open_tickets: number;
    ranked_members: number;
  };
  roles: {
    id: string;
    name: string;
    color: string;
    managed: boolean;
    reward_safe: boolean;
  }[];
  channels: {
    id: string;
    name: string;
    kind: string;
    category: string | null;
  }[];
};
export type BotCase = {
  id: number;
  action: string;
  target_id: string;
  actor_id: string;
  reason: string;
  details: Record<string, unknown>;
  created_at: number;
  voided: number;
};
export type LeaderboardEntry = {
  position: number;
  user_id: string;
  username: string;
  avatar: string | null;
  xp: number;
  messages: number;
  level: number;
  progress: number;
};
export type Leaderboard = {
  available: boolean;
  entries: LeaderboardEntry[];
  total: number;
  page: number;
};
export type Transcript = {
  id: number;
  panel_id: string;
  owner_id: string;
  created_at: number;
  closed_at: number;
  expires_at: number;
  total_messages: number;
  page: number;
  messages: {
    id: string;
    author_id: string;
    author: string;
    created_at: string;
    edited_at: string | null;
    content: string;
    embeds: {
      title?: string;
      description?: string;
      fields?: { name: string; value: string }[];
    }[];
    attachments: { name: string; size: number; url: string }[];
  }[];
};
