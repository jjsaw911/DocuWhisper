import os
from aiohttp import web
from server import PromptServer

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

_INDEX = os.path.join(os.path.dirname(__file__), "web", "index.html")


@PromptServer.instance.routes.get("/photostudio")
@PromptServer.instance.routes.get("/photostudio/")
async def _studio_index(request):
    return web.FileResponse(_INDEX)


__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
