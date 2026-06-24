import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.services.market_stream import (
    IST,
    STREAM_STALE_SECONDS,
    market_state,
    market_stream,
    normalize_instrument,
    normalize_interval,
)


router = APIRouter(
    prefix="/market-realtime",
    tags=["Market Realtime"],
)


@router.on_event("startup")
async def startup_realtime_service():
    try:
        market_stream.start()
    except Exception as e:
        print(f"Market stream startup skipped (not available in this environment): {e}")


@router.on_event("shutdown")
async def shutdown_realtime_service():
    market_stream.stop()


async def _stream_single_instrument(
    websocket: WebSocket,
    exchange: str,
    symboltoken: str,
    interval: str,
):
    exchange, symboltoken, symbol_key = normalize_instrument(
        exchange,
        symboltoken,
    )
    interval = normalize_interval(interval)
    await websocket.accept()
    market_stream.subscribe(exchange, symboltoken)

    last_version = -1
    last_heartbeat = 0.0

    try:
        initial_candles = market_state.get_candles(
            exchange,
            symboltoken,
            interval,
            limit=160,
        )
        initial_quote = market_state.get_quote(exchange, symboltoken)

        await websocket.send_json(
            {
                "type": "initial_data",
                "symbol_key": symbol_key,
                "interval": interval,
                "candles": initial_candles,
                "quote": initial_quote,
                "feed": market_stream.status(),
            }
        )

        while True:
            update = market_state.get_update(
                exchange,
                symboltoken,
                interval,
            )
            loop_time = asyncio.get_running_loop().time()

            if update["version"] != last_version and update["quote"]:
                last_version = update["version"]
                last_heartbeat = loop_time

                await websocket.send_json(
                    {
                        "type": "market_update",
                        "symbol_key": symbol_key,
                        "interval": interval,
                        "quote": update["quote"],
                        "candle": update["candle"],
                        "feed": market_stream.status(),
                    }
                )
            elif loop_time - last_heartbeat >= 15:
                last_heartbeat = loop_time
                await websocket.send_json(
                    {
                        "type": "heartbeat",
                        "symbol_key": symbol_key,
                        "interval": interval,
                        "server_time": datetime.now(IST).isoformat(),
                        "feed": market_stream.status(),
                    }
                )

            await asyncio.sleep(0.05)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        market_stream.unsubscribe(exchange, symboltoken)


@router.websocket("/ws/candles/{exchange}/{symboltoken}")
async def websocket_realtime_candles(
    websocket: WebSocket,
    exchange: str,
    symboltoken: str,
    interval: str = Query("ONE_MINUTE"),
):
    try:
        await _stream_single_instrument(
            websocket,
            exchange,
            symboltoken,
            interval,
        )
    except ValueError as exc:
        await websocket.close(code=1008, reason=str(exc)[:120])
    except Exception:
        try:
            await websocket.close(code=1011, reason="Live feed unavailable")
        except RuntimeError:
            pass


@router.websocket("/ws/quotes")
async def websocket_realtime_quotes(
    websocket: WebSocket,
    instruments: str = Query(...),
):
    parsed_instruments = []

    try:
        for raw_instrument in instruments.split(","):
            exchange, token = raw_instrument.split(":", 1)
            clean_exchange, clean_token, symbol_key = normalize_instrument(
                exchange,
                token,
            )
            parsed_instruments.append(
                (clean_exchange, clean_token, symbol_key)
            )

        if not parsed_instruments or len(parsed_instruments) > 50:
            raise ValueError("Provide between 1 and 50 instruments")
    except ValueError as exc:
        await websocket.close(code=1008, reason=str(exc)[:120])
        return

    await websocket.accept()

    for exchange, token, _symbol_key in parsed_instruments:
        market_stream.subscribe(exchange, token)

    last_versions = {}
    last_heartbeat = 0.0

    try:
        while True:
            updates = []

            for exchange, token, symbol_key in parsed_instruments:
                version = market_state.get_version(symbol_key)

                if version == last_versions.get(symbol_key):
                    continue

                quote = market_state.get_quote(exchange, token)

                if quote:
                    last_versions[symbol_key] = version
                    updates.append(quote)

            loop_time = asyncio.get_running_loop().time()

            if updates:
                last_heartbeat = loop_time
                await websocket.send_json(
                    {
                        "type": "quote_batch",
                        "quotes": updates,
                        "feed": market_stream.status(),
                    }
                )
            elif loop_time - last_heartbeat >= 15:
                last_heartbeat = loop_time
                await websocket.send_json(
                    {
                        "type": "heartbeat",
                        "server_time": datetime.now(IST).isoformat(),
                        "feed": market_stream.status(),
                    }
                )

            await asyncio.sleep(0.05)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        for exchange, token, _symbol_key in parsed_instruments:
            market_stream.unsubscribe(exchange, token)


@router.get("/quote")
def get_real_time_quote(
    exchange: str,
    symboltoken: str,
):
    try:
        quote = market_state.get_quote(
            exchange,
            symboltoken,
            max_age_seconds=STREAM_STALE_SECONDS,
        )

        if quote:
            return {
                "status": True,
                "quote": quote,
                "feed": market_stream.status(),
            }

        return {
            "status": False,
            "message": "No fresh streaming quote is available yet",
            "feed": market_stream.status(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/candles-live")
def get_live_candles(
    exchange: str,
    symboltoken: str,
    interval: str = Query("ONE_MINUTE"),
    limit: int = Query(120, ge=1, le=500),
):
    try:
        candles = market_state.get_candles(
            exchange,
            symboltoken,
            interval,
            limit,
        )

        return {
            "status": True,
            "exchange": exchange.upper().strip(),
            "symboltoken": str(symboltoken).strip(),
            "interval": normalize_interval(interval),
            "candles": candles,
            "count": len(candles),
            "timestamp": datetime.now(IST).isoformat(),
            "feed": market_stream.status(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/status")
def get_realtime_status():
    return market_stream.status()
