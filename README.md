# Paper Trading Pro

A professional-grade paper trading platform for learning and practicing stock market trading strategies with simulated capital. Connects to Angel One's API for real market data and executes paper trades with virtual ₹10,00,000 capital.

## Features

- **Live Market Data** — Real-time LTP, OHLC, and WebSocket market feed via Angel One
- **Paper Trading** — Buy/sell with market, limit, stop-loss, and target orders
- **Portfolio Management** — Track virtual P&L, holdings, and allocation
- **Interactive Charts** — TradingView-powered OHLC candles with multiple timeframes
- **Watchlist** — Monitor your selected stocks with live prices
- **Order Management** — View order history, status, and timelines
- **Transaction History** — Complete audit trail of all executed trades
- **Trading Journal** — Record strategy, mistakes, emotions, and lessons learned
- **Analytics Dashboard** — Win rate, P&L distribution, profit factor, and more
- **Equity Curve** — Track portfolio value over time with drawdown analysis
- **Strategy Backtesting** — Test SMA crossover and RSI strategies on historical data
- **Reports & Export** — Download CSV/PDF reports for transactions, orders, and holdings
- **Broker Configuration UI** — Update Angel One credentials from the Settings page without editing .env
- **Admin Dashboard** — Platform-wide user and activity monitoring
- **Responsive Design** — Works on desktop, tablet, and mobile

## Tech Stack

| Layer      | Technology                                      |
| ---------- | ----------------------------------------------- |
| Frontend   | React 18, React Router 7, Vite, Axios           |
| Backend    | Python 3.12+, FastAPI, SQLAlchemy, Alembic      |
| Database   | SQLite (dev) / PostgreSQL (production)          |
| Market API | Angel One SmartAPI + WebSocket V2               |
| Auth       | JWT (email/password + Google OAuth)             |
| Charts     | TradingView Lightweight Charts                  |
| Encryption | Fernet (symmetric) for broker credentials       |

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Angel One trading account (for live market data)

### Backend Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `backend/.env` with your Angel One credentials:

| Variable              | Description                         |
| --------------------- | ----------------------------------- |
| ANGELONE_API_KEY      | API key from Angel One dev console  |
| ANGELONE_CLIENT_CODE  | Your Angel One client ID            |
| ANGELONE_PASSWORD     | Your Angel One login password       |
| ANGELONE_TOTP_SECRET  | TOTP secret for 2FA (base32)        |

Generate credential encryption key (for broker settings UI):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add the output as `CREDENTIAL_ENCRYPTION_KEY` in `.env`.

Run migrations and start:

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd Frontend
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173** in your browser.

## API Routes

| Group                | Prefix               | Description                     |
| -------------------- | -------------------- | ------------------------------- |
| Authentication       | `/auth/*`            | Register, login, Google OAuth   |
| Market Data          | `/market/*`          | LTP, candles, quotes, stats     |
| Portfolio            | `/portfolio/*`       | Cash balance, reset             |
| Holdings             | `/holdings/*`        | Current positions               |
| Orders               | `/orders/*`          | Order lifecycle                 |
| Transactions         | `/transactions/*`    | Trade history                   |
| Trade Execution      | `/trade/*`           | Buy/sell paper orders           |
| Watchlist            | `/watchlist/*`       | User watchlists                 |
| Dashboard            | `/dashboard/*`       | Aggregated portfolio summary    |
| Analytics            | `/analytics-extra/*` | Win rate, P&L distribution      |
| Equity Curve         | `/portfolio/equity*` | Portfolio value over time       |
| Reports              | `/reports/*`         | CSV/PDF exports                 |
| Backtesting          | `/backtesting/*`     | Strategy backtests              |
| Trading Journal      | `/journal/*`         | Journal CRUD                    |
| Broker Config        | `/broker/*`          | Encrypted credential management |
| Admin                | `/admin/*`           | Platform monitoring             |
| Services Preferences | `/services/*`        | Notification toggles            |
| Market Calendar      | `/market-calendar/*` | Holiday and trading hours       |

## Project Structure

```
Paper Trading/
├── Frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── api/              # API client, realtime WebSocket
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route pages
│   │   └── styles/           # CSS stylesheets
│   └── ...
├── backend/                  # FastAPI server
│   ├── app/
│   │   ├── api/              # Route handlers
│   │   ├── core/             # Auth, JWT, dependencies
│   │   ├── db/               # Database setup
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   └── services/         # Angel One, email, market stream
│   ├── alembic/              # Database migrations
│   └── ...
└── README.md
```

## Screenshots

_(Add screenshots of Dashboard, StockDetails, Portfolio, and Settings pages here)_

## License

This project is for educational purposes only. No real money is involved — all trades are simulated.
