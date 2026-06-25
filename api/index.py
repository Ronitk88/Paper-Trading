import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"

sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app as backend_app

app = backend_app