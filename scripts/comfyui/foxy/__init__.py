"""Foxy — self-hosted AI photo generation app.

Loaded as a ComfyUI custom node so it shares the same web server and runs
inside the existing ComfyUI Python process. Persistent state lives in
/workspace/foxy/ on the instance disk.
"""
import os
import sys

_DIR = os.path.dirname(os.path.abspath(__file__))
if _DIR not in sys.path:
    sys.path.insert(0, _DIR)

import db
db.init()
import routes  # noqa: F401, E402 - import side-effect: registers HTTP routes

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
