from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.core.dependencies import get_current_user
from app.models.service_preference import ServicePreference
from app.schemas.service_preference import (
    ServicePreferenceUpdate,
    ServicePreferenceResponse,
)

router = APIRouter(
    prefix="/services",
    tags=["Services"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id
    return current_user


def get_or_create_preferences(user_id: int, db: Session):
    preferences = (
        db.query(ServicePreference)
        .filter(ServicePreference.user_id == user_id)
        .first()
    )

    if preferences:
        return preferences

    preferences = ServicePreference(
        user_id=user_id,
        order_alerts=True,
        rejected_order_alerts=True,
        portfolio_alerts=True,
        price_alerts=True,
        daily_summary=True,
        risk_warnings=True,
        email_notifications=False,
        sound_alerts=True,
    )

    db.add(preferences)
    db.commit()
    db.refresh(preferences)

    return preferences


@router.get("/preferences", response_model=ServicePreferenceResponse)
def get_service_preferences(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return get_or_create_preferences(user_id, db)


@router.patch("/preferences", response_model=ServicePreferenceResponse)
def update_service_preferences(
    payload: ServicePreferenceUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    preferences = get_or_create_preferences(user_id, db)

    update_data = payload.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(preferences, key, value)

    db.commit()
    db.refresh(preferences)

    return preferences