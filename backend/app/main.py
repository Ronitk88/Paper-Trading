import os
import threading
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import Base, engine, SessionLocal
from app.services.stock_sync import sync_nse_bse_stocks_if_needed


BASE_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)


# Import models so SQLAlchemy can create/discover all tables
from app.models.user import User
from app.models.portfolio import Portfolio
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.models.watchlist import Watchlist
from app.models.order import Order
from app.models.stock import Stock
from app.models.service_preference import ServicePreference
from app.models.email_otp import EmailOTP
from app.models.trade_journal import TradeJournal
from app.models.password_reset import PasswordResetToken

try:
    import importlib

    PhoneOTP = importlib.import_module("app.models.phone_otp").PhoneOTP
except Exception:
    PhoneOTP = None


# Routers
from app.api.auth import router as auth_router
from app.api.portfolio import router as portfolio_router
from app.api.holding import router as holding_router
from app.api.transaction import router as transaction_router
from app.api.trade import router as trade_router
from app.api.watchlist import router as watchlist_router
from app.api.market import router as market_router
from app.api.market_realtime import router as market_realtime_router
from app.api.market_aggressive import router as market_aggressive_router
from app.api.stocks import router as stocks_router
from app.api.order import router as order_router
from app.api.service_preferences import router as service_preferences_router
from app.api.email_otp import router as email_otp_router
from app.api.phone_otp import router as phone_otp_router
from app.api.trade_journal import router as trade_journal_router
from app.api.reports import router as reports_router
from app.api.admin import router as admin_router
from app.api.analytics_extra import router as analytics_extra_router
from app.api.backtesting import router as backtesting_router
from app.api.market_calendar import router as market_calendar_router
from app.api.dashboard import router as dashboard_router
from app.api.broker import router as broker_router


def get_allowed_origins():
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://paper-trading-7pd8.vercel.app",
    ]

    frontend_url = os.getenv("FRONTEND_URL")
    cors_origins = os.getenv("CORS_ORIGINS", "")

    extra_origins = []

    if frontend_url:
        extra_origins.append(frontend_url.strip())

    if cors_origins:
        extra_origins.extend(
            origin.strip()
            for origin in cors_origins.split(",")
            if origin.strip()
        )

    return list(dict.fromkeys(default_origins + extra_origins))


app = FastAPI(
    title="Paper Trading API",
    description="Paper Trading Platform Backend",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_database_tables():
    try:
        print("Creating/checking database tables...")
        Base.metadata.create_all(bind=engine)
        print("Database tables ready.")
    except Exception as e:
        print("Database table creation failed:", e)


def auto_sync_stock_master():
    db = SessionLocal()

    try:
        print("Checking stock master...")

        result = sync_nse_bse_stocks_if_needed(db)

        print("Stock master sync result:", result)

    except Exception as e:
        print("Auto stock sync failed:", e)

    finally:
        db.close()


@app.get("/")
def home():
    return {
        "message": "Paper Trading API Running",
        "status": "ok",
        "version": "1.0.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "paper-trading-api",
    }


@app.on_event("startup")
def startup_tasks():
    create_database_tables()

    auto_sync_enabled = os.getenv("AUTO_SYNC_STOCKS", "true").lower() == "true"

    if auto_sync_enabled:
        thread = threading.Thread(
            target=auto_sync_stock_master,
            daemon=True,
        )

        thread.start()


app.include_router(auth_router)
app.include_router(portfolio_router)
app.include_router(holding_router)
app.include_router(transaction_router)
app.include_router(trade_router)
app.include_router(watchlist_router)
app.include_router(market_router)
app.include_router(market_realtime_router)
app.include_router(market_aggressive_router)
app.include_router(stocks_router)
app.include_router(order_router)
app.include_router(service_preferences_router)
app.include_router(email_otp_router)
app.include_router(phone_otp_router)
app.include_router(trade_journal_router)
app.include_router(reports_router)
app.include_router(admin_router)
app.include_router(analytics_extra_router)
app.include_router(backtesting_router)
app.include_router(market_calendar_router)
app.include_router(dashboard_router)
app.include_router(broker_router)