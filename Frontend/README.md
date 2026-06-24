# Paper Trading Pro

A professional paper trading platform for learning and practicing stock market trading strategies with simulated capital.

## Features

- **Stock Search & Quotes** — LTP, OHLC, day change, volume from Angel One
- **Paper Trading** — Buy/sell with market, limit, stop-loss, and target orders
- **Portfolio Management** — Track holdings, P&L, allocation, and risk metrics
- **Dashboard** — Single-page summary of portfolio, holdings, orders, and transactions
- **TradingView Charts** — Embedded OHLC candle charts with live quote integration
- **Strategy Backtesting** — Test SMA/RSI strategies on historical candle data
- **Equity Curve** — Visualize portfolio growth over time
- **Trading Journal** — Record strategy, emotions, and lessons per trade
- **Reports & PDF Export** — Download transactions, holdings, and portfolio reports
- **Admin Dashboard** — System-wide stats for authorized admin users
- **Market Status** — Auto-detects open/closed market hours
- **Mobile Responsive** — Works on 360px to full desktop

## Tech Stack

- **Frontend:** React 19 + Vite + React Router
- **Backend:** Python + FastAPI + SQLAlchemy + SQLite
- **Data:** Angel One SmartAPI (REST + WebSocket V2)
- **Auth:** JWT + bcrypt + Google OAuth + OTP

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt

# Copy .env.example to .env and fill in your Angel One credentials
cp .env.example .env

# Run
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANGELONE_API_KEY` | Angel One developer API key |
| `ANGELONE_CLIENT_CODE` | Angel One client ID |
| `ANGELONE_PASSWORD` | Angel One trading password |
| `ANGELONE_TOTP_SECRET` | TOTP secret for Angel One 2FA |
| `SECRET_KEY` | JWT signing secret |
| `ADMIN_EMAILS` | Comma-separated list of admin emails |
| `VITE_API_BASE_URL` | Backend URL (default: http://127.0.0.1:8000) |

## License

This project is for educational purposes. No real money is involved.