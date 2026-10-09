"""Independent retention job; does not connect to Discord."""

import os
from .store import Store

if __name__ == "__main__":
    store = Store(
        os.environ.get("GDM_BOT_DATABASE", "/var/lib/gdmacros-bot/bot.sqlite3")
    )
    try:
        store.cleanup()
    finally:
        store.close()
