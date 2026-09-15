"""account deletion grace period

Revision ID: 38744d13f0c1
Revises: 5ae20e7a4185
Create Date: 2026-09-15 10:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '38744d13f0c1'
down_revision: str | None = '5ae20e7a4185'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Alembic does not notice changes to the CHECK constraints behind our enums,
# so the new values are written out here by hand.
_SENSITIVE_OLD = ('delete_account', 'change_email', 'change_password', 'link_provider', 'unlink_provider')
_SENSITIVE_NEW = ('delete_account', 'cancel_deletion', 'change_email', 'change_password', 'link_provider', 'unlink_provider')
_REVOKE_OLD = ('rotated', 'reuse_detected', 'logout', 'password_reset', 'device_limit', 'admin')
_REVOKE_NEW = _REVOKE_OLD + ('account_deletion',)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.add_column('users', sa.Column('deletion_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('deletion_scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_users_deletion_due', 'users', ['deletion_scheduled_at'], unique=False, postgresql_where='deletion_scheduled_at IS NOT NULL')

    op.drop_constraint(op.f('ck_reauth_proofs_sensitiveaction'), 'reauth_proofs', type_='check')
    op.create_check_constraint(op.f('ck_reauth_proofs_sensitiveaction'), 'reauth_proofs', _in('action', _SENSITIVE_NEW))
    op.drop_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', type_='check')
    op.create_check_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', _in('revoke_reason', _REVOKE_NEW))


def downgrade() -> None:
    op.execute("DELETE FROM reauth_proofs WHERE action = 'cancel_deletion'")
    op.execute("UPDATE refresh_tokens SET revoke_reason = 'admin' WHERE revoke_reason = 'account_deletion'")
    op.drop_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', type_='check')
    op.create_check_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', _in('revoke_reason', _REVOKE_OLD))
    op.drop_constraint(op.f('ck_reauth_proofs_sensitiveaction'), 'reauth_proofs', type_='check')
    op.create_check_constraint(op.f('ck_reauth_proofs_sensitiveaction'), 'reauth_proofs', _in('action', _SENSITIVE_OLD))

    op.drop_index('ix_users_deletion_due', table_name='users', postgresql_where='deletion_scheduled_at IS NOT NULL')
    op.drop_column('users', 'deleted_at')
    op.drop_column('users', 'deletion_scheduled_at')
    op.drop_column('users', 'deletion_requested_at')
