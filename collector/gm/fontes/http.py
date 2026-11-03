"""Cliente HTTP educado: User-Agent identificado e intervalo mínimo entre requisições."""

from __future__ import annotations

import os
import time

import httpx

INTERVALO_PADRAO = 1.0  # segundos entre requisições ao mesmo cliente


def user_agent() -> str:
    contato = os.environ.get("GM_CONTACT", "contato nao configurado")
    return f"GuiaDoMercado/0.1 (comparador de precos para consumidores; {contato})"


class ClienteEducado:
    def __init__(self, intervalo: float = INTERVALO_PADRAO, timeout: float = 30.0):
        self.intervalo = intervalo
        self._ultimo = 0.0
        self._http = httpx.Client(
            headers={"User-Agent": user_agent(), "Accept": "application/json"},
            timeout=timeout,
            follow_redirects=True,
        )

    def _esperar(self) -> None:
        falta = self.intervalo - (time.monotonic() - self._ultimo)
        if falta > 0:
            time.sleep(falta)
        self._ultimo = time.monotonic()

    def get(self, url: str, verificar: bool = True, **kw) -> httpx.Response:
        """GET espaçado. Com verificar=False, devolve a resposta mesmo com status de erro."""
        self._esperar()
        r = self._http.get(url, **kw)
        if verificar:
            r.raise_for_status()
        return r

    def post(self, url: str, **kw) -> httpx.Response:
        self._esperar()
        r = self._http.post(url, **kw)
        r.raise_for_status()
        return r

    def close(self) -> None:
        self._http.close()
