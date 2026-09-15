"""email change tokens, password change revoke reason and email change throttle

Revision ID: d4b7e19a2c83
Revises: e9a4c27d51b3
Create Date: 2026-09-15 20:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd4b7e19a2c83'
down_revision: str | None = 'e9a4c27d51b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Alembic does not notice changes to the CHECK constraints behind our enums,
# so the new values are written out here by hand.
_REVOKE_OLD = ('rotated', 'reuse_detected', 'logout', 'password_reset', 'device_limit', 'admin', 'account_deletion')
_REVOKE_NEW = _REVOKE_OLD + ('password_change',)
_THROTTLE_OLD = ('login', 'reauth', 'signup', 'email_verification', 'password_reset')
_THROTTLE_NEW = _THROTTLE_OLD + ('email_change',)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table('email_change_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('new_email', sa.String(length=320), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_email_change_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_email_change_tokens'))
    )
    op.create_index('ix_email_change_tokens_user', 'email_change_tokens', ['user_id'], unique=False)
    op.create_index('uq_email_change_tokens_hash', 'email_change_tokens', ['token_hash'], unique=True)

    op.drop_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', type_='check')
    op.create_check_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', _in('revoke_reason', _REVOKE_NEW))
    op.drop_constraint(op.f('ck_throttle_counters_throttlescope'), 'throttle_counters', type_='check')
    op.create_check_constraint(op.f('ck_throttle_counters_throttlescope'), 'throttle_counters', _in('scope', _THROTTLE_NEW))


def downgrade() -> None:
    op.execute("DELETE FROM throttle_counters WHERE scope = 'email_change'")
    op.drop_constraint(op.f('ck_throttle_counters_throttlescope'), 'throttle_counters', type_='check')
    op.create_check_constraint(op.f('ck_throttle_counters_throttlescope'), 'throttle_counters', _in('scope', _THROTTLE_OLD))
    op.execute("UPDATE refresh_tokens SET revoke_reason = 'password_reset' WHERE revoke_reason = 'password_change'")
    op.drop_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', type_='check')
    op.create_check_constraint(op.f('ck_refresh_tokens_revokereason'), 'refresh_tokens', _in('revoke_reason', _REVOKE_OLD))

    op.drop_index('uq_email_change_tokens_hash', table_name='email_change_tokens')
    op.drop_index('ix_email_change_tokens_user', table_name='email_change_tokens')
    op.drop_table('email_change_tokens')
