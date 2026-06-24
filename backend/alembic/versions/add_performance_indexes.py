"""add performance indexes

Revision ID: add_performance_indexes
Revises: 894213b7a6b9
Create Date: 2026-06-23 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "add_performance_indexes"
down_revision: Union[str, Sequence[str], None] = "894213b7a6b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Stocks
    op.create_index("ix_stocks_symbol", "stocks", ["symbol"], if_not_exists=True)
    op.create_index("ix_stocks_name", "stocks", ["name"], if_not_exists=True)
    op.create_index("ix_stocks_exchange", "stocks", ["exchange"], if_not_exists=True)
    op.create_index("ix_stocks_token", "stocks", ["token"], if_not_exists=True)

    # Orders
    op.create_index("ix_orders_user_id", "orders", ["user_id"], if_not_exists=True)
    op.create_index("ix_orders_status", "orders", ["status"], if_not_exists=True)
    op.create_index("ix_orders_created_at", "orders", ["created_at"], if_not_exists=True)

    # Transactions
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"], if_not_exists=True)
    op.create_index("ix_transactions_created_at", "transactions", ["created_at"], if_not_exists=True)

    # Holdings
    op.create_index("ix_holdings_user_id", "holdings", ["user_id"], if_not_exists=True)

    # Watchlist
    op.create_index("ix_watchlist_user_id", "watchlist", ["user_id"], if_not_exists=True)

    # Journal
    op.create_index("ix_trade_journals_user_id", "trade_journals", ["user_id"], if_not_exists=True)
    op.create_index("ix_trade_journals_created_at", "trade_journals", ["created_at"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_stocks_symbol", "stocks", if_exists=True)
    op.drop_index("ix_stocks_name", "stocks", if_exists=True)
    op.drop_index("ix_stocks_exchange", "stocks", if_exists=True)
    op.drop_index("ix_stocks_token", "stocks", if_exists=True)

    op.drop_index("ix_orders_user_id", "orders", if_exists=True)
    op.drop_index("ix_orders_status", "orders", if_exists=True)
    op.drop_index("ix_orders_created_at", "orders", if_exists=True)

    op.drop_index("ix_transactions_user_id", "transactions", if_exists=True)
    op.drop_index("ix_transactions_created_at", "transactions", if_exists=True)

    op.drop_index("ix_holdings_user_id", "holdings", if_exists=True)

    op.drop_index("ix_watchlist_user_id", "watchlist", if_exists=True)

    op.drop_index("ix_trade_journals_user_id", "trade_journals", if_exists=True)
    op.drop_index("ix_trade_journals_created_at", "trade_journals", if_exists=True)
