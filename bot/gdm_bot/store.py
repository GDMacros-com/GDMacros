"""Single-process SQLite state. Transactions never span a Discord API await."""

import json
import os
import sqlite3
import time
from pathlib import Path
from .models import Settings
from .security import UserError

RETENTION = 30 * 86400


class Store:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path)
        if path != ":memory:":
            os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA secure_delete=ON")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target_id TEXT NOT NULL,
          actor_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL, created_at REAL NOT NULL, voided INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS cases_target ON cases(target_id,id);
        CREATE INDEX IF NOT EXISTS cases_actor ON cases(actor_id,id);
        CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL,
          body TEXT NOT NULL, created_at REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, case_id INTEGER);
        CREATE TABLE IF NOT EXISTS locks (channel_id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS levels (user_id TEXT PRIMARY KEY, username TEXT NOT NULL, avatar TEXT,
          xp INTEGER NOT NULL DEFAULT 0, messages INTEGER NOT NULL DEFAULT 0, last_xp REAL NOT NULL DEFAULT 0,
          hidden INTEGER NOT NULL DEFAULT 0, present INTEGER NOT NULL DEFAULT 1, color TEXT, background BLOB);
        CREATE TABLE IF NOT EXISTS xp_daily (user_id TEXT NOT NULL, day TEXT NOT NULL, xp INTEGER NOT NULL, messages INTEGER NOT NULL,
          PRIMARY KEY(user_id,day));
        CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_id TEXT NOT NULL,
          channel_id TEXT UNIQUE, owner_id TEXT NOT NULL, claimed_by TEXT, status TEXT NOT NULL DEFAULT 'open',
          created_at REAL NOT NULL, closed_at REAL, expires_at REAL, transcript TEXT, panel_snapshot TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS voice (channel_id TEXT PRIMARY KEY, owner_id TEXT UNIQUE NOT NULL, created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS voice_permissions (channel_id TEXT PRIMARY KEY REFERENCES voice(channel_id) ON DELETE CASCADE, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS published (key TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
          created_at REAL NOT NULL, detail TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pending_unbans (user_id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS expired_channels (channel_id TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS ticket_permissions (ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          purpose TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(ticket_id,purpose));
        """)
        self.db.execute(
            "INSERT OR IGNORE INTO settings VALUES(1,1,?)",
            (Settings().model_dump_json(),),
        )
        self.db.commit()

    def close(self):
        self.db.close()

    def rows(self, sql, args=()):
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        r = self.db.execute(sql, args).fetchone()
        return dict(r) if r else None

    def execute(self, sql, args=()):
        with self.db:
            return self.db.execute(sql, args)

    def settings(self):
        r = self.one("SELECT revision,body FROM settings WHERE id=1")
        return r["revision"], Settings.model_validate_json(r["body"])

    def save_settings(self, revision, settings: Settings, actor: str):
        with self.db:
            cursor = self.db.execute(
                "UPDATE settings SET revision=revision+1,body=? WHERE id=1 AND revision=?",
                (settings.model_dump_json(), revision),
            )
            if not cursor.rowcount:
                raise UserError(
                    "Settings changed in another session. Reload before saving"
                )
            self.db.execute(
                "INSERT INTO audit(actor,action,created_at,detail) VALUES(?,?,?,?)",
                (
                    actor,
                    "settings_saved",
                    time.time(),
                    "Configuration revision " + str(revision + 1),
                ),
            )
        return revision + 1

    def case(self, action, target, actor, reason, details=None):
        return self.execute(
            "INSERT INTO cases(action,target_id,actor_id,reason,details,created_at) VALUES(?,?,?,?,?,?)",
            (
                action,
                str(target),
                str(actor),
                reason[:1500],
                json.dumps(details or {}),
                time.time(),
            ),
        ).lastrowid

    def queue(self, channel_id, body, case_id=None):
        self.execute(
            "INSERT INTO outbox(channel_id,body,created_at,case_id) VALUES(?,?,?,?)",
            (str(channel_id), json.dumps(body), time.time(), case_id),
        )

    def cases(self, target="", actor="", action="", sort="newest", page=1):
        clauses, values = [], []
        for key, value in (
            ("target_id", target),
            ("actor_id", actor),
            ("action", action),
        ):
            if value:
                clauses.append(key + "=?")
                values.append(value)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        count = self.one("SELECT count(*) AS total FROM cases" + where, values)["total"]
        order = "ASC" if sort == "oldest" else "DESC"
        rows = self.rows(
            "SELECT * FROM cases"
            + where
            + " ORDER BY id "
            + order
            + " LIMIT 25 OFFSET ?",
            (*values, (page - 1) * 25),
        )
        return {
            "total": count,
            "page": page,
            "cases": [{**r, "details": json.loads(r["details"])} for r in rows],
        }

    def ensure_member(self, user_id, username, avatar=None):
        self.execute(
            "INSERT INTO levels(user_id,username,avatar) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,avatar=excluded.avatar,present=1",
            (str(user_id), username[:100], avatar),
        )
        return self.one("SELECT * FROM levels WHERE user_id=?", (str(user_id),))

    def cleanup(self, now=None):
        now = time.time() if now is None else now
        # Expired transcripts are inaccessible even before this maintenance runs.
        expired = self.rows(
            "SELECT channel_id,id FROM tickets WHERE expires_at<=?", (now,)
        )
        with self.db:
            for row in expired:
                if row["channel_id"]:
                    self.db.execute(
                        "INSERT OR IGNORE INTO expired_channels VALUES(?)",
                        (row["channel_id"],),
                    )
            self.db.execute("DELETE FROM tickets WHERE expires_at<=?", (now,))
            self.db.execute(
                "DELETE FROM xp_daily WHERE day < date(?, 'unixepoch', '-400 days')",
                (now,),
            )
        if expired:
            self.db.execute("VACUUM")
        return expired

    def transcript(self, number, now=None):
        return self.one(
            "SELECT id,panel_id,owner_id,created_at,closed_at,expires_at,transcript FROM tickets WHERE id=? AND transcript IS NOT NULL AND expires_at>?",
            (number, time.time() if now is None else now),
        )

    def audit(self, actor, action, detail):
        self.execute(
            "INSERT INTO audit(actor,action,created_at,detail) VALUES(?,?,?,?)",
            (str(actor), action, time.time(), detail[:1000]),
        )
