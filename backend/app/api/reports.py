import csv
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.holding import Holding
from app.models.order import Order
from app.models.portfolio import Portfolio
from app.models.transaction import Transaction


router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


def get_user_id(current_user):
    if hasattr(current_user, "id"):
        return current_user.id

    return current_user


def build_csv_response(filename: str, headers: list[str], rows: list[list]):
    output = StringIO()
    writer = csv.writer(output)

    writer.writerow(headers)
    writer.writerows(rows)

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def build_pdf_response(
    filename: str,
    title: str,
    headers: list[str],
    rows: list[list],
):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="PDF export requires reportlab. Install it with: pip install reportlab",
        )

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=24,
        leftMargin=24,
        topMargin=24,
        bottomMargin=24,
    )

    styles = getSampleStyleSheet()

    table_data = [headers]

    for row in rows:
        table_data.append([str(item) if item is not None else "-" for item in row])

    table = Table(table_data, repeatRows=1)

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
            ]
        )
    )

    elements = [
        Paragraph(title, styles["Title"]),
        Spacer(1, 12),
        table,
    ]

    doc.build(elements)

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def get_transactions_rows(user_id: int, db: Session):
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.id.desc())
        .all()
    )

    return [
        [
            item.id,
            item.symbol,
            item.transaction_type,
            item.quantity,
            item.price,
            float(item.quantity or 0) * float(item.price or 0),
            item.created_at,
        ]
        for item in transactions
    ]


def get_orders_rows(user_id: int, db: Session):
    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.id.desc())
        .all()
    )

    return [
        [
            item.id,
            item.symbol,
            item.side,
            item.order_type,
            item.quantity,
            item.price,
            item.status,
            item.executed_price,
            item.rejection_reason,
            item.created_at,
            item.executed_at,
        ]
        for item in orders
    ]


def get_holdings_rows(user_id: int, db: Session):
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id)
        .order_by(Holding.symbol.asc())
        .all()
    )

    rows = []

    for item in holdings:
        quantity = float(item.quantity or 0)
        avg_price = float(item.avg_price or 0)
        current_price = float(item.current_price or 0)

        invested = quantity * avg_price
        current_value = quantity * current_price
        pnl = current_value - invested

        rows.append(
            [
                item.id,
                item.symbol,
                item.quantity,
                item.avg_price,
                item.current_price,
                invested,
                current_value,
                pnl,
            ]
        )

    return rows


def get_portfolio_rows(user_id: int, db: Session):
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.user_id == user_id)
        .first()
    )

    if not portfolio:
        return []

    return [
        [
            portfolio.cash_balance,
            getattr(portfolio, "invested_value", None),
            getattr(portfolio, "current_holdings_value", None),
            portfolio.total_value,
            portfolio.total_pnl,
        ]
    ]


TRANSACTION_HEADERS = [
    "ID",
    "Symbol",
    "Type",
    "Quantity",
    "Price",
    "Total Value",
    "Created At",
]

ORDER_HEADERS = [
    "ID",
    "Symbol",
    "Side",
    "Order Type",
    "Quantity",
    "Price",
    "Status",
    "Executed Price",
    "Rejection Reason",
    "Created At",
    "Executed At",
]

HOLDING_HEADERS = [
    "ID",
    "Symbol",
    "Quantity",
    "Average Price",
    "Current Price",
    "Invested Value",
    "Current Value",
    "P&L",
]

PORTFOLIO_HEADERS = [
    "Cash Balance",
    "Invested Value",
    "Current Holdings Value",
    "Total Value",
    "Total P&L",
]


@router.get("/transactions.csv")
def export_transactions_csv(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_csv_response(
        filename="transactions.csv",
        headers=TRANSACTION_HEADERS,
        rows=get_transactions_rows(user_id, db),
    )


@router.get("/orders.csv")
def export_orders_csv(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_csv_response(
        filename="orders.csv",
        headers=ORDER_HEADERS,
        rows=get_orders_rows(user_id, db),
    )


@router.get("/holdings.csv")
def export_holdings_csv(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_csv_response(
        filename="holdings.csv",
        headers=HOLDING_HEADERS,
        rows=get_holdings_rows(user_id, db),
    )


@router.get("/portfolio.csv")
def export_portfolio_csv(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_csv_response(
        filename="portfolio.csv",
        headers=PORTFOLIO_HEADERS,
        rows=get_portfolio_rows(user_id, db),
    )


@router.get("/transactions.pdf")
def export_transactions_pdf(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_pdf_response(
        filename="transactions.pdf",
        title="Transactions Report",
        headers=TRANSACTION_HEADERS,
        rows=get_transactions_rows(user_id, db),
    )


@router.get("/orders.pdf")
def export_orders_pdf(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_pdf_response(
        filename="orders.pdf",
        title="Orders Report",
        headers=ORDER_HEADERS,
        rows=get_orders_rows(user_id, db),
    )


@router.get("/holdings.pdf")
def export_holdings_pdf(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_pdf_response(
        filename="holdings.pdf",
        title="Holdings Report",
        headers=HOLDING_HEADERS,
        rows=get_holdings_rows(user_id, db),
    )


@router.get("/portfolio.pdf")
def export_portfolio_pdf(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = get_user_id(current_user)

    return build_pdf_response(
        filename="portfolio.pdf",
        title="Portfolio Report",
        headers=PORTFOLIO_HEADERS,
        rows=get_portfolio_rows(user_id, db),
    )
