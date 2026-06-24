import requests

from app.db.database import SessionLocal, engine, Base
from app.models.stock import Stock

# Make sure the table exists
Base.metadata.create_all(bind=engine)

db = SessionLocal()

URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"

print("Downloading instrument master...")

response = requests.get(URL, timeout=30)
response.raise_for_status()
data = response.json()

count = 0

for item in data:
    exchange = item.get("exch_seg")

    # Only keep NSE and BSE equities
    if exchange not in ("NSE", "BSE"):
        continue

    symbol = item.get("symbol")
    name = item.get("name")
    token = item.get("token")

    if not symbol or not token:
        continue

    exists = (
        db.query(Stock)
        .filter(
            Stock.symbol == symbol,
            Stock.exchange == exchange,
        )
        .first()
    )

    if exists:
        continue

    db.add(
        Stock(
            symbol=symbol,
            name=name,
            exchange=exchange,
            token=token,
        )
    )

    count += 1

db.commit()
db.close()

print(f"Imported {count} stocks successfully!")