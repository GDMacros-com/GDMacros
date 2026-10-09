"use client";
import type {
  BotModule,
  BotSettings,
  BotState,
  Embed,
  Reward,
  TicketPanel,
} from "@/lib/bot/types";
import {
  Card,
  ChannelField,
  EmbedEditor,
  MultiSelect,
  NumberField,
  ListField,
  RoleField,
  SelectField,
  TextField,
  Toggle,
  buttonClass,
} from "./Fields";

type Props = {
  module: BotModule;
  state: BotState;
  value: BotSettings;
  onChange: (v: BotSettings) => void;
  action: (name: string, data?: Record<string, unknown>) => void;
  busy: boolean;
  dirty: boolean;
};
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b[a-z]/g, (x) => x.toUpperCase());
const emptyEmbed = (title: string, description: string): Embed => ({
  title,
  description,
  color: "#3b82f6",
  footer: "GDMacros • Community",
  image: "",
});

export default function Modules({
  module,
  state,
  value,
  onChange,
  action,
  busy,
  dirty,
}: Props) {
  if (module === "boostnotifications") {
    const s = value.boostnotifications;
    const set = (v: Partial<typeof s>) =>
      onChange({ ...value, boostnotifications: { ...s, ...v } });
    return (
      <>
        <Card title="Boost announcement">
          <ChannelField
            label="Announcement channel"
            value={s.channel_id}
            onChange={(channel_id) => set({ channel_id })}
            state={state}
          />
          <EmbedEditor
            value={s.embed}
            onChange={(embed) => set({ embed })}
            variables="{user}, {username}, {server}, {boosts}"
          />
          <button
            type="button"
            disabled={busy || dirty || !s.channel_id}
            className={buttonClass}
            onClick={() => action("test-boost")}
          >
            Send a test to the saved channel
          </button>
        </Card>
      </>
    );
  }
  if (module === "honeypot") {
    const s = value.honeypot;
    const set = (v: Partial<typeof s>) =>
      onChange({ ...value, honeypot: { ...s, ...v } });
    return (
      <>
        <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm leading-relaxed text-text-dim">
          Posting in this channel triggers a softban: the member is removed,
          recent messages are cleared, and they can rejoin. Saving an enabled
          honeypot posts its warning before activating it. The server owner,
          bots and exempt roles are excluded.
        </div>
        <Card title="Trap channel">
          <ChannelField
            label="Honeypot channel"
            value={s.channel_id}
            onChange={(channel_id) => set({ channel_id })}
            state={state}
          />
          <RoleField
            label="Exempt roles"
            value={s.exempt_roles}
            onChange={(exempt_roles) => set({ exempt_roles })}
            state={state}
          />
          <NumberField
            label="Recent messages to delete (seconds)"
            value={s.delete_seconds}
            min={0}
            max={604800}
            onChange={(delete_seconds) => set({ delete_seconds })}
          />
          <p className="text-xs text-muted">
            Choose a permanent case channel in Moderation first. Keep the bot
            role above the members it needs to remove.
          </p>
        </Card>
        <Card
          title="Recognizable warning"
          description="A fixed channel-rule field is added to the message so the softban warning stays clear."
        >
          <EmbedEditor
            value={s.embed}
            onChange={(embed) => set({ embed })}
            variables="No variables"
          />
        </Card>
      </>
    );
  }
  if (module === "moderation") {
    const s = value.moderation;
    const set = (v: Partial<typeof s>) =>
      onChange({ ...value, moderation: { ...s, ...v } });
    const groups = [
      [
        "Messages",
        "message_delete",
        "message_edit",
        "image_delete",
        "bulk_message_delete",
        "moderator_command",
      ],
      [
        "Members",
        "member_join",
        "member_leave",
        "role_add",
        "role_remove",
        "member_timeout",
        "nickname_change",
        "member_ban",
        "member_unban",
      ],
      ["Roles", "role_create", "role_delete", "role_edit"],
      ["Channels", "channel_create", "channel_update", "channel_delete"],
      ["Emoji", "emoji_create", "emoji_rename", "emoji_delete"],
      ["Voice", "voice_join", "voice_leave", "voice_move"],
    ];
    return (
      <>
        <Card
          title="Cases and command access"
          description="Every successful moderation action gets a case ID. Case delivery retries if Discord is temporarily unavailable."
        >
          <ChannelField
            label="Permanent case log channel (private staff channel)"
            value={s.case_channel_id}
            onChange={(case_channel_id) => set({ case_channel_id })}
            state={state}
          />
          <p className="text-sm text-muted">
            Chat prefix: <code className="text-text">?</code>. The same commands
            are available as slash commands. The server owner can use enabled
            commands; other members need a selected role. Mute uses Discord
            timeout. Lock saves the channel&apos;s permissions; Discord
            administrators can still bypass it.
          </p>
        </Card>
        <Card
          title="Commands"
          description="Configure each command separately. Dangerous commands cannot be opened to everyone."
        >
          <div className="space-y-3">
            {Object.entries(s.commands).map(([name, rule]) => (
              <div key={name} className="rounded-xl border border-border p-4">
                <Toggle
                  label={`/${name} and ?${name}`}
                  checked={rule.enabled}
                  onChange={(enabled) =>
                    set({
                      commands: { ...s.commands, [name]: { ...rule, enabled } },
                    })
                  }
                />
                <div className="mt-3">
                  <RoleField
                    label={`Roles allowed to use ${name}`}
                    value={rule.roles}
                    onChange={(roles) =>
                      set({
                        commands: { ...s.commands, [name]: { ...rule, roles } },
                      })
                    }
                    state={state}
                  />
                </div>
                {[
                  "rank",
                  "leaderboard",
                  "colour",
                  "privacy",
                  "background",
                  "wrapped",
                  "voice",
                ].includes(name) && (
                  <div className="mt-3">
                    <Toggle
                      label={`Allow everyone to use ${name}`}
                      checked={rule.everyone}
                      onChange={(everyone) =>
                        set({
                          commands: {
                            ...s.commands,
                            [name]: { ...rule, everyone },
                          },
                        })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card
          title="Event logs"
          description="Choose destinations for each event. Ticket message contents are excluded from general logs. Uncached message content and unknown actors are labelled honestly."
        >
          {groups.map(([title, ...events]) => (
            <details
              key={title}
              className="rounded-xl border border-border p-4"
            >
              <summary className="cursor-pointer font-semibold">
                {title}
                <span className="ml-2 text-xs font-normal text-muted">
                  {events.filter((e) => s.logs[e].enabled).length} enabled
                </span>
              </summary>
              <div className="mt-4 space-y-5">
                {events.map((name) => (
                  <div key={name} className="space-y-3">
                    <Toggle
                      label={label(name)}
                      checked={s.logs[name].enabled}
                      onChange={(enabled) =>
                        set({
                          logs: {
                            ...s.logs,
                            [name]: { ...s.logs[name], enabled },
                          },
                        })
                      }
                    />
                    <ChannelField
                      label={`${label(name)} log channel`}
                      value={s.logs[name].channel_id}
                      onChange={(channel_id) =>
                        set({
                          logs: {
                            ...s.logs,
                            [name]: { ...s.logs[name], channel_id },
                          },
                        })
                      }
                      state={state}
                    />
                  </div>
                ))}
              </div>
            </details>
          ))}
          <MultiSelect
            label="Channels excluded from message logs"
            selected={s.ignored_channels}
            options={state.channels
              .filter((c) => c.kind === "text")
              .map((c) => ({ id: c.id, name: "#" + c.name }))}
            onChange={(ignored_channels) => set({ ignored_channels })}
          />
        </Card>
      </>
    );
  }
  if (module === "tempvoice") {
    const s = value.tempvoice;
    const set = (v: Partial<typeof s>) =>
      onChange({ ...value, tempvoice: { ...s, ...v } });
    return (
      <Card
        title="Join to create"
        description="Joining the lobby creates “[user]'s vc”. Empty channels are deleted, including after bot restarts."
      >
        <ChannelField
          label="Lobby voice channel"
          value={s.lobby_id}
          onChange={(lobby_id) => set({ lobby_id })}
          state={state}
          kind="voice"
        />
        <ChannelField
          label="Temporary channel category"
          value={s.category_id}
          onChange={(category_id) => set({ category_id })}
          state={state}
          kind="category"
        />
        <NumberField
          label="Default user limit (0 is unlimited)"
          value={s.user_limit}
          min={0}
          max={99}
          onChange={(user_limit) => set({ user_limit })}
        />
        <p className="text-sm text-muted">
          Owners use <code>?voice name</code>, <code>limit</code>,{" "}
          <code>lock</code>, <code>unlock</code>, <code>permit</code>,{" "}
          <code>reject</code> and <code>transfer</code>. Permit, reject and
          transfer take a user ID. Discord administrators bypass voice locks.
        </p>
      </Card>
    );
  }
  if (module === "tickets") {
    const s = value.tickets;
    const set = (panels: TicketPanel[]) =>
      onChange({ ...value, tickets: { ...s, panels } });
    const patch = (index: number, update: Partial<TicketPanel>) =>
      set(s.panels.map((p, i) => (i === index ? { ...p, ...update } : p)));
    return (
      <>
        <Card
          title="Ticket panels"
          description="Each panel has its own staff, welcome message and transcript destination. Closed transcripts expire after 30 days and require a website admin account."
        >
          <button
            type="button"
            className={buttonClass}
            disabled={s.panels.length >= 25}
            onClick={() =>
              set([
                ...s.panels,
                {
                  id: "panel-" + Date.now().toString(36),
                  name: "Community support",
                  enabled: true,
                  channel_id: "",
                  category_id: "",
                  transcript_channel_id: "",
                  staff_roles: [],
                  button_label: "Open a ticket",
                  max_open_per_user: 1,
                  creator_can_close: true,
                  ask_reason: true,
                  embed: emptyEmbed(
                    "Need a hand?",
                    "Open a private ticket with the GDM Community team.",
                  ),
                  welcome: emptyEmbed(
                    "Welcome, {username}",
                    "Tell us what you need help with. A team member will reply here.",
                  ),
                },
              ])
            }
          >
            + Add a panel
          </button>
          <p className="text-xs text-muted">
            Staff roles apply to new tickets. Existing tickets retain their
            original access. Transcripts are linked in Discord; raw copies are
            kept on the bot service for 30 days.
          </p>
        </Card>
        {s.panels.map((p, i) => (
          <Card key={p.id} title={p.name || "New ticket panel"}>
            <Toggle
              label={`Enable ${p.name || "panel"}`}
              checked={p.enabled}
              onChange={(enabled) => patch(i, { enabled })}
            />
            <TextField
              label="Panel name"
              value={p.name}
              maxLength={100}
              onChange={(name) => patch(i, { name })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <ChannelField
                label="Panel message channel"
                value={p.channel_id}
                onChange={(v) => patch(i, { channel_id: v || "" })}
                state={state}
              />
              <ChannelField
                label="Ticket category"
                value={p.category_id}
                onChange={(v) => patch(i, { category_id: v || "" })}
                state={state}
                kind="category"
              />
            </div>
            <ChannelField
              label="Transcript notice channel (private staff channel)"
              value={p.transcript_channel_id}
              onChange={(v) => patch(i, { transcript_channel_id: v || "" })}
              state={state}
            />
            <RoleField
              label="Ticket staff roles"
              value={p.staff_roles}
              onChange={(staff_roles) => patch(i, { staff_roles })}
              state={state}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Button label"
                value={p.button_label}
                maxLength={80}
                onChange={(button_label) => patch(i, { button_label })}
              />
              <NumberField
                label="Open ticket limit per member"
                value={p.max_open_per_user}
                min={1}
                max={5}
                onChange={(max_open_per_user) =>
                  patch(i, { max_open_per_user })
                }
              />
            </div>
            <Toggle
              label="Let the ticket creator close their ticket"
              checked={p.creator_can_close}
              onChange={(creator_can_close) => patch(i, { creator_can_close })}
            />
            <Toggle
              label="Ask for an opening message"
              checked={p.ask_reason}
              onChange={(ask_reason) => patch(i, { ask_reason })}
            />
            <details className="rounded-lg border border-border p-4" open>
              <summary className="cursor-pointer font-semibold">
                Panel embed
              </summary>
              <div className="mt-4">
                <EmbedEditor
                  value={p.embed}
                  onChange={(embed) => patch(i, { embed })}
                  variables="{server}"
                />
              </div>
            </details>
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer font-semibold">
                Ticket welcome embed
              </summary>
              <div className="mt-4">
                <EmbedEditor
                  value={p.welcome}
                  onChange={(welcome) => patch(i, { welcome })}
                  variables="{user}, {username}, {server}, {ticket}"
                />
              </div>
            </details>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy || dirty || !p.enabled || !s.enabled}
                onClick={() => action("publish-panel", { panel_id: p.id })}
              >
                Publish or update saved panel
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose/40 px-4 py-2.5 text-sm text-rose"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove the ${p.name} panel? Existing tickets and transcripts are retained under their existing rules.`,
                    )
                  )
                    set(s.panels.filter((_, index) => index !== i));
                }}
              >
                Remove panel
              </button>
            </div>
          </Card>
        ))}
      </>
    );
  }
  const s = value.leveling;
  const set = (v: Partial<typeof s>) =>
    onChange({ ...value, leveling: { ...s, ...v } });
  const setReward = (index: number, update: Partial<Reward>) =>
    set({
      rewards: s.rewards.map((r, i) => (i === index ? { ...r, ...update } : r)),
    });
  return (
    <>
      <Card title="XP channels and pace">
        <SelectField
          label="Eligible channels"
          value={s.channel_mode}
          onChange={(v) => set({ channel_mode: v as typeof s.channel_mode })}
          options={[
            {
              value: "all_except",
              label: "All channels except the selected channels",
            },
            { value: "only", label: "Only the selected channels" },
          ]}
        />
        <MultiSelect
          label="Selected channels"
          selected={s.channels}
          options={state.channels
            .filter((c) => c.kind === "text")
            .map((c) => ({ id: c.id, name: "#" + c.name }))}
          onChange={(channels) => set({ channels })}
        />
        <Toggle
          label="Allow XP in threads"
          checked={s.threads}
          onChange={(threads) => set({ threads })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="XP cooldown (seconds)"
            value={s.cooldown_seconds}
            min={5}
            max={3600}
            onChange={(cooldown_seconds) => set({ cooldown_seconds })}
          />
          <NumberField
            label="Minimum XP per message"
            value={s.min_xp}
            min={1}
            max={1000}
            onChange={(min_xp) => set({ min_xp })}
          />
          <NumberField
            label="Maximum XP per message"
            value={s.max_xp}
            min={1}
            max={1000}
            onChange={(max_xp) => set({ max_xp })}
          />
        </div>
        <Toggle
          label="Give XP for successful bot slash commands"
          checked={s.slash_xp}
          onChange={(slash_xp) => set({ slash_xp })}
        />
        <RoleField
          label="Roles that cannot earn XP"
          value={s.blacklisted_roles}
          onChange={(blacklisted_roles) => set({ blacklisted_roles })}
          state={state}
        />
        <ListField
          label="Ignore messages starting with these prefixes (comma separated)"
          value={s.ignored_prefixes}
          onChange={(ignored_prefixes) => set({ ignored_prefixes })}
        />
      </Card>
      <Card
        title="XP curve"
        description="Cumulative XP needed to reach each level. Imported levels must match this curve."
      >
        <div className="flex flex-wrap gap-2">
          {[
            { name: "Lurkr", c: [150, -100, 50, 0, 0] },
            { name: "Amari", c: [55, -40, 20, 0, 0] },
            { name: "MEE6", c: [0, 75.833333, 22.5, 1.666667, 0] },
            { name: "Your custom curve", c: [150, 100, 48, 0.885, 0] },
          ].map((p) => (
            <button
              type="button"
              key={p.name}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs hover:border-accent"
              onClick={() => set({ coefficients: p.c })}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {["Constant", "Linear", "Quadratic", "Cubic", "Quartic"].map(
            (name, i) => (
              <NumberField
                key={name}
                label={name}
                value={s.coefficients[i] ?? 0}
                step="any"
                onChange={(v) =>
                  set({
                    coefficients: Array.from({ length: 5 }, (_, k) =>
                      k === i ? v : (s.coefficients[k] ?? 0),
                    ),
                  })
                }
              />
            ),
          )}
        </div>
        <Curve coefficients={s.coefficients} />
      </Card>
      <Card title="Level-up messages">
        <SelectField
          label="Send level-up messages to"
          value={s.notification_mode}
          onChange={(v) =>
            set({ notification_mode: v as typeof s.notification_mode })
          }
          options={[
            { value: "dm", label: "Direct messages" },
            { value: "same_channel", label: "The same channel" },
            { value: "custom", label: "A selected channel" },
            { value: "none", label: "No messages" },
          ]}
        />
        {s.notification_mode === "custom" && (
          <ChannelField
            label="Level-up channel"
            value={s.notification_channel_id}
            onChange={(notification_channel_id) =>
              set({ notification_channel_id })
            }
            state={state}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Notify every N levels"
            value={s.notification_every}
            min={1}
            max={250}
            onChange={(notification_every) => set({ notification_every })}
          />
          <NumberField
            label="Minimum level for notifications"
            value={s.notification_min_level}
            min={1}
            max={1000}
            onChange={(notification_min_level) =>
              set({ notification_min_level })
            }
          />
        </div>
        <ListField
          label="Specific notification levels (optional, comma separated; overrides interval)"
          value={s.notification_levels.map(String)}
          onChange={(v) => set({ notification_levels: v.map(Number) })}
        />
        <Toggle
          label="Only notify levels with role rewards"
          checked={s.notify_rewards_only}
          onChange={(notify_rewards_only) => set({ notify_rewards_only })}
        />
        <SelectField
          label="Message format"
          value={s.notification_format}
          onChange={(v) =>
            set({ notification_format: v as typeof s.notification_format })
          }
          options={[
            { value: "embed", label: "Embed" },
            { value: "text", label: "Plain message" },
          ]}
        />
        <EmbedEditor
          value={s.notification_embed}
          onChange={(notification_embed) => set({ notification_embed })}
          variables="{user}, {username}, {server}, {level}"
        />
      </Card>
      <Card
        title="Role rewards"
        description="Automatic rewards cannot grant moderation permissions. Stack keeps previously earned rewards; switching it off replaces earlier rewards."
      >
        {s.rewards.map((r, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-border p-4"
          >
            <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
              <NumberField
                label="Reward level"
                value={r.level}
                min={1}
                max={1000}
                onChange={(level) => setReward(i, { level })}
              />
              <RoleField
                label="Reward roles"
                value={r.roles}
                onChange={(roles) => setReward(i, { roles })}
                state={state}
                rewards
              />
            </div>
            <Toggle
              label="Stack with previous rewards"
              checked={r.stack}
              onChange={(stack) => setReward(i, { stack })}
            />
            <button
              type="button"
              className="text-xs text-rose"
              onClick={() =>
                set({ rewards: s.rewards.filter((_, n) => n !== i) })
              }
            >
              Remove reward
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              set({
                rewards: [
                  ...s.rewards,
                  {
                    level: (s.rewards.at(-1)?.level ?? 0) + 5,
                    roles: [],
                    stack: true,
                  },
                ],
              })
            }
          >
            + Add reward
          </button>
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2.5 text-sm"
            disabled={busy || dirty}
            onClick={() => action("sync-rewards")}
          >
            Sync saved rewards with members
          </button>
        </div>
        <RoleField
          label="Roles excluded from all rewards"
          value={s.reward_excluded_roles}
          onChange={(reward_excluded_roles) => set({ reward_excluded_roles })}
          state={state}
        />
        <Toggle
          label="Reassign role rewards when members rejoin"
          checked={s.reassign_on_rejoin}
          onChange={(reassign_on_rejoin) => set({ reassign_on_rejoin })}
        />
      </Card>
      <Card title="Daily champion">
        <RoleField
          label="Champion role (choose one)"
          value={s.champion_role_id ? [s.champion_role_id] : []}
          onChange={(v) => set({ champion_role_id: v.at(-1) ?? null })}
          state={state}
          rewards
        />
        <RoleField
          label="Roles excluded from becoming champion"
          value={s.champion_excluded_roles}
          onChange={(champion_excluded_roles) =>
            set({ champion_excluded_roles })
          }
          state={state}
        />
      </Card>
      <Card title="Rank appearance and retention">
        <TextField
          label="Default rank progress color"
          type="color"
          value={s.rank_color}
          onChange={(rank_color) => set({ rank_color })}
        />
        <Toggle
          label="Public web leaderboard"
          checked={s.leaderboard_public}
          onChange={(leaderboard_public) => set({ leaderboard_public })}
        />
        <Toggle
          label="Reset XP when a member leaves"
          checked={s.reset_on_leave}
          onChange={(reset_on_leave) => set({ reset_on_leave })}
        />
        <Toggle
          label="Reset XP on permanent bans"
          help="Softban cleanup preserves XP unless reset on leave is also enabled."
          checked={s.reset_on_ban}
          onChange={(reset_on_ban) => set({ reset_on_ban })}
        />
        <p className="text-xs text-muted">
          Members can hide or erase their rank with /privacy. Imported XP does
          not generate historical level-up DMs.
        </p>
      </Card>
    </>
  );
}

function Curve({ coefficients }: { coefficients: number[] }) {
  const at = (n: number) =>
    Math.round(coefficients.reduce((sum, c, k) => sum + c * n ** k, 0));
  const values = Array.from({ length: 100 }, (_, i) => at(i + 1));
  const max = Math.max(1, ...values.filter(Number.isFinite));
  const points = values
    .map(
      (v, i) =>
        `${20 + i * 5.6},${160 - Math.max(0, Math.min(1, v / max)) * 130}`,
    )
    .join(" ");
  return (
    <div className="rounded-xl border border-border bg-bg-deep p-4">
      <svg
        viewBox="0 0 600 180"
        className="w-full"
        role="img"
        aria-label="XP required to reach levels 1 to 100"
      >
        <path d="M20 20V160H580" fill="none" stroke="var(--border)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
      </svg>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
        {[1, 10, 50, 100].map((n) => (
          <span key={n}>
            Level {n}:{" "}
            <strong className="text-text">
              {Number.isFinite(at(n)) ? at(n).toLocaleString() : "Invalid"} XP
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}
