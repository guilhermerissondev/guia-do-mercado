"""Conexão com o Postgres (Supabase ou local). Configure DATABASE_URL."""

from __future__ import annotations

import os

import psycopg
from psycopg.rows import dict_row


def conectar(url: str | None = None) -> psycopg.Connection:
    url = url or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("defina DATABASE_URL (ex.: postgresql://postgres:senha@localhost:54329/postgres)")
    return psycopg.connect(url, autocommit=True, row_factory=dict_row)
