from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query

from app.services.angelone import get_smart_api


router = APIRouter(
    prefix="/backtesting",
    tags=["Strategy Backtesting"],
)

ALLOWED_INTERVALS = {
    "ONE_DAY",
    "ONE_HOUR",
    "THIRTY_MINUTE",
    "FIFTEEN_MINUTE",
    "FIVE_MINUTE",
}

ALLOWED_STRATEGIES = {
    "SMA_CROSSOVER",
    "RSI",
}


def previous_market_day(value: datetime):
    value = value - timedelta(days=1)

    while value.weekday() >= 5:
        value = value - timedelta(days=1)

    return value


def get_safe_market_dates(interval: str, days: int):
    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(ist)

    market_open = time(9, 15)
    market_close = time(15, 30)

    if now.weekday() >= 5:
        to_date = previous_market_day(now).replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    elif now.time() < market_open:
        to_date = previous_market_day(now).replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    elif now.time() > market_close:
        to_date = now.replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )
    else:
        to_date = now.replace(second=0, microsecond=0)

    from_date = to_date - timedelta(days=days)

    if interval == "ONE_DAY":
        from_date = from_date.replace(
            hour=9,
            minute=15,
            second=0,
            microsecond=0,
        )

        to_date = to_date.replace(
            hour=15,
            minute=30,
            second=0,
            microsecond=0,
        )

    return from_date, to_date


def format_angel_date(value: datetime):
    return value.strftime("%Y-%m-%d %H:%M")


def parse_candle_response(response):
    if not isinstance(response, dict):
        return []

    raw_data = response.get("data")

    if not raw_data:
        return []

    candles = []

    for row in raw_data:
        if not row or len(row) < 6:
            continue

        candles.append(
            {
                "time": row[0],
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5] or 0),
            }
        )

    return candles


def fetch_candles(
    exchange: str,
    symboltoken: str,
    interval: str,
    days: int,
):
    from_date, to_date = get_safe_market_dates(interval, days)

    params = {
        "exchange": exchange,
        "symboltoken": symboltoken,
        "interval": interval,
        "fromdate": format_angel_date(from_date),
        "todate": format_angel_date(to_date),
    }

    smart = get_smart_api()

    try:
        response = smart.getCandleData(params)
    except Exception:
        smart = get_smart_api(force_refresh=True)
        response = smart.getCandleData(params)

    return parse_candle_response(response), params


def calculate_sma(values, period: int):
    if len(values) < period:
        return None

    return sum(values[-period:]) / period


def calculate_rsi(values, period: int = 14):
    if len(values) <= period:
        return None

    recent = values[-(period + 1):]

    gains = []
    losses = []

    for index in range(1, len(recent)):
        change = recent[index] - recent[index - 1]

        if change >= 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        return 100

    rs_value = avg_gain / avg_loss

    return 100 - (100 / (1 + rs_value))


def run_sma_strategy(
    candles,
    initial_capital: float,
    quantity: int,
    short_window: int,
    long_window: int,
):
    cash = float(initial_capital)
    position_qty = 0
    entry_price = 0

    closes = []
    previous_signal = None
    trades = []
    equity_curve = []

    for candle in candles:
        close_price = float(candle["close"])
        closes.append(close_price)

        short_sma = calculate_sma(closes, short_window)
        long_sma = calculate_sma(closes, long_window)

        signal = None

        if short_sma is not None and long_sma is not None:
            if short_sma > long_sma:
                signal = "BULLISH"
            elif short_sma < long_sma:
                signal = "BEARISH"

        if (
            signal == "BULLISH"
            and previous_signal != "BULLISH"
            and position_qty == 0
        ):
            cost = quantity * close_price

            if cash >= cost:
                cash -= cost
                position_qty = quantity
                entry_price = close_price

                trades.append(
                    {
                        "time": candle["time"],
                        "side": "BUY",
                        "price": close_price,
                        "quantity": quantity,
                        "reason": f"{short_window} SMA crossed above {long_window} SMA",
                    }
                )

        elif (
            signal == "BEARISH"
            and previous_signal != "BEARISH"
            and position_qty > 0
        ):
            proceeds = position_qty * close_price
            cash += proceeds

            trades.append(
                {
                    "time": candle["time"],
                    "side": "SELL",
                    "price": close_price,
                    "quantity": position_qty,
                    "pnl": round((close_price - entry_price) * position_qty, 2),
                    "reason": f"{short_window} SMA crossed below {long_window} SMA",
                }
            )

            position_qty = 0
            entry_price = 0

        if signal:
            previous_signal = signal

        holdings_value = position_qty * close_price
        total_value = cash + holdings_value

        equity_curve.append(
            {
                "time": candle["time"],
                "cash": round(cash, 2),
                "holdings_value": round(holdings_value, 2),
                "total_value": round(total_value, 2),
                "close": close_price,
                "short_sma": round(short_sma, 2) if short_sma else None,
                "long_sma": round(long_sma, 2) if long_sma else None,
                "signal": signal,
            }
        )

    if position_qty > 0 and candles:
        last_price = float(candles[-1]["close"])
        cash += position_qty * last_price

        trades.append(
            {
                "time": candles[-1]["time"],
                "side": "SELL",
                "price": last_price,
                "quantity": position_qty,
                "pnl": round((last_price - entry_price) * position_qty, 2),
                "reason": "Backtest closed open position at final candle",
            }
        )

    final_value = cash
    total_pnl = final_value - initial_capital

    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "final_value": round(final_value, 2),
        "total_pnl": round(total_pnl, 2),
        "return_percent": round((total_pnl / initial_capital) * 100, 2),
    }


def run_rsi_strategy(
    candles,
    initial_capital: float,
    quantity: int,
    rsi_period: int,
    rsi_buy: float,
    rsi_sell: float,
):
    cash = float(initial_capital)
    position_qty = 0
    entry_price = 0

    closes = []
    trades = []
    equity_curve = []

    for candle in candles:
        close_price = float(candle["close"])
        closes.append(close_price)

        rsi = calculate_rsi(closes, rsi_period)

        if rsi is not None and rsi <= rsi_buy and position_qty == 0:
            cost = quantity * close_price

            if cash >= cost:
                cash -= cost
                position_qty = quantity
                entry_price = close_price

                trades.append(
                    {
                        "time": candle["time"],
                        "side": "BUY",
                        "price": close_price,
                        "quantity": quantity,
                        "reason": f"RSI below buy level {rsi_buy}",
                    }
                )

        elif rsi is not None and rsi >= rsi_sell and position_qty > 0:
            proceeds = position_qty * close_price
            cash += proceeds

            trades.append(
                {
                    "time": candle["time"],
                    "side": "SELL",
                    "price": close_price,
                    "quantity": position_qty,
                    "pnl": round((close_price - entry_price) * position_qty, 2),
                    "reason": f"RSI above sell level {rsi_sell}",
                }
            )

            position_qty = 0
            entry_price = 0

        holdings_value = position_qty * close_price
        total_value = cash + holdings_value

        equity_curve.append(
            {
                "time": candle["time"],
                "cash": round(cash, 2),
                "holdings_value": round(holdings_value, 2),
                "total_value": round(total_value, 2),
                "close": close_price,
                "rsi": round(rsi, 2) if rsi is not None else None,
            }
        )

    if position_qty > 0 and candles:
        last_price = float(candles[-1]["close"])
        cash += position_qty * last_price

        trades.append(
            {
                "time": candles[-1]["time"],
                "side": "SELL",
                "price": last_price,
                "quantity": position_qty,
                "pnl": round((last_price - entry_price) * position_qty, 2),
                "reason": "Backtest closed open position at final candle",
            }
        )

    final_value = cash
    total_pnl = final_value - initial_capital

    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "final_value": round(final_value, 2),
        "total_pnl": round(total_pnl, 2),
        "return_percent": round((total_pnl / initial_capital) * 100, 2),
    }


@router.get("/run")
def run_backtest(
    exchange: str,
    symboltoken: str,
    tradingsymbol: str = "",
    strategy: str = Query("SMA_CROSSOVER"),
    interval: str = Query("ONE_DAY"),
    days: int = Query(180, ge=30, le=365),
    initial_capital: float = Query(100000, gt=0),
    quantity: int = Query(1, ge=1),
    short_window: int = Query(9, ge=2, le=100),
    long_window: int = Query(21, ge=3, le=200),
    rsi_period: int = Query(14, ge=2, le=100),
    rsi_buy: float = Query(30, ge=1, le=99),
    rsi_sell: float = Query(70, ge=1, le=99),
):
    strategy = strategy.upper().strip()
    interval = interval.upper().strip()
    exchange = exchange.upper().strip()
    symboltoken = str(symboltoken).strip()
    tradingsymbol = str(tradingsymbol or "").upper().strip()

    if strategy not in ALLOWED_STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid strategy. Allowed: {sorted(ALLOWED_STRATEGIES)}",
        )

    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval. Allowed: {sorted(ALLOWED_INTERVALS)}",
        )

    if strategy == "SMA_CROSSOVER" and short_window >= long_window:
        raise HTTPException(
            status_code=400,
            detail="Short SMA window must be smaller than long SMA window.",
        )

    if strategy == "RSI" and rsi_buy >= rsi_sell:
        raise HTTPException(
            status_code=400,
            detail="RSI buy level must be lower than RSI sell level.",
        )

    candles, request_params = fetch_candles(
        exchange=exchange,
        symboltoken=symboltoken,
        interval=interval,
        days=days,
    )

    if not candles:
        return {
            "status": False,
            "message": "No candle data available for backtesting.",
            "exchange": exchange,
            "tradingsymbol": tradingsymbol,
            "symboltoken": symboltoken,
            "strategy": strategy,
            "candles": [],
            "trades": [],
            "equity_curve": [],
            "request_params": request_params,
        }

    if strategy == "SMA_CROSSOVER":
        result = run_sma_strategy(
            candles=candles,
            initial_capital=initial_capital,
            quantity=quantity,
            short_window=short_window,
            long_window=long_window,
        )
    else:
        result = run_rsi_strategy(
            candles=candles,
            initial_capital=initial_capital,
            quantity=quantity,
            rsi_period=rsi_period,
            rsi_buy=rsi_buy,
            rsi_sell=rsi_sell,
        )

    return {
        "status": True,
        "message": "Backtest completed successfully",
        "exchange": exchange,
        "tradingsymbol": tradingsymbol,
        "symboltoken": symboltoken,
        "strategy": strategy,
        "interval": interval,
        "days": days,
        "initial_capital": initial_capital,
        "quantity": quantity,
        "candle_count": len(candles),
        "trade_count": len(result["trades"]),
        "summary": {
            "final_value": result["final_value"],
            "total_pnl": result["total_pnl"],
            "return_percent": result["return_percent"],
        },
        "parameters": {
            "short_window": short_window,
            "long_window": long_window,
            "rsi_period": rsi_period,
            "rsi_buy": rsi_buy,
            "rsi_sell": rsi_sell,
        },
        "trades": result["trades"],
        "equity_curve": result["equity_curve"],
        "request_params": request_params,
    }
