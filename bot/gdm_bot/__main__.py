import asyncio
import logging
from aiohttp import web
from .api import application
from .runtime import CommunityBot
from .security import Environment
from .store import Store


async def main():
    env = Environment.load()
    store = Store(env.database)
    store.cleanup()
    bot = CommunityBot(env, store)
    runner = web.AppRunner(application(bot), access_log=None)
    await runner.setup()
    # Expose through a TLS reverse proxy, never bind the private API to 0.0.0.0.
    await web.TCPSite(runner, "127.0.0.1", env.port).start()
    try:
        async with bot:
            await bot.start(env.token)
    finally:
        await runner.cleanup()
        store.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    # Discord/aiohttp debug logs can include remote request context; keep them quiet.
    logging.getLogger("discord").setLevel(logging.WARNING)
    asyncio.run(main())
