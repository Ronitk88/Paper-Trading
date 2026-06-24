import sys
from pathlib import Path

# Ensure backend/ is importable — this lets Vercel's Python runtime
# find the FastAPI app and all its relative imports within backend/
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.main import app as backend_app


class _ASGIProxy:
    """ASGI wrapper that strips the /api prefix for Vercel.

    Vercel routes /api/* requests to this function, but the
    FastAPI routes are defined without an /api prefix (e.g.,
    /auth/login, /portfolio). This wrapper strips the prefix
    so the backend app sees the correct paths.
    """

    def __init__(self, app, prefix="/api"):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope["path"].startswith(self.prefix):
            scope = dict(scope)
            scope["path"] = scope["path"][len(self.prefix):] or "/"
            scope["root_path"] = self.prefix
        await self.app(scope, receive, send)


app = _ASGIProxy(backend_app)
