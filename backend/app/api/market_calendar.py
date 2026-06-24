from fastapi import APIRouter

from utils.market_hours import get_market_holidays, get_market_status


router = APIRouter(
    prefix="/market-calendar",
    tags=["Market Calendar"],
)


@router.get("/status")
def calendar_market_status():
    return get_market_status()


@router.get("/holidays")
def calendar_holidays():
    holidays = get_market_holidays()

    return {
        "count": len(holidays),
        "holidays": holidays,
    }
