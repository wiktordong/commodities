"""Fetch free public market data for the morning brief.

Uses Yahoo Finance via yfinance. Returns a flat dict of placeholder->value
so the template can substitute directly. Anything we cannot source from
free APIs (Dubai, LME 3M, ETS, iron ore CFR, etc.) is left as a clearly
flagged placeholder string so the brief still renders.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import yfinance as yf


# Yahoo tickers we can reliably pull for free.
TICKERS: dict[str, str] = {
    # Energy
    "BRENT": "BZ=F",
    "WTI": "CL=F",
    "NATGAS": "NG=F",
    "GASOIL": "QS=F",
    "RBOB": "RB=F",
    # Metals
    "COPPER": "HG=F",       # COMEX copper, USD/lb (proxy for LME 3M)
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "PLATINUM": "PL=F",
    "PALLADIUM": "PA=F",
    # Macro
    "US10Y": "^TNX",        # yield x10
    "DXY": "DX-Y.NYB",
    "SPX": "^GSPC",
    "VIX": "^VIX",
    "USDCNH": "CNH=X",
    "EURUSD": "EURUSD=X",
    "USDJPY": "JPY=X",
}


def _fmt(v: float, digits: int = 2) -> str:
    if v is None:
        return "n/a"
    return f"{v:,.{digits}f}"


def _pct(v: float) -> str:
    if v is None:
        return "n/a"
    sign = "+" if v >= 0 else ""
    return f"{sign}{v:.2f}"


def _safe_history(ticker: str, period: str = "10d") -> Any:
    try:
        return yf.Ticker(ticker).history(period=period, auto_adjust=False)
    except Exception:
        return None


def _last_and_changes(ticker: str) -> tuple[float | None, float | None, float | None]:
    """Return (last, 1d_chg_pct, 1w_chg_pct)."""
    hist = _safe_history(ticker, "10d")
    if hist is None or hist.empty:
        return None, None, None
    closes = hist["Close"].dropna()
    if closes.empty:
        return None, None, None
    last = float(closes.iloc[-1])
    d1 = None
    if len(closes) >= 2:
        prev = float(closes.iloc[-2])
        if prev != 0:
            d1 = (last - prev) / prev * 100
    w1 = None
    if len(closes) >= 6:
        wk = float(closes.iloc[-6])
        if wk != 0:
            w1 = (last - wk) / wk * 100
    return last, d1, w1


def fetch_all() -> dict[str, str]:
    """Build the placeholder dict consumed by the Jinja template."""
    out: dict[str, str] = {}

    # Date placeholders (Asia/CET reference)
    today = dt.datetime.utcnow()
    out["ASIA_TODAY_DATE"] = today.strftime("%A, %d %B %Y")
    out["US_CLOSE_DATE"] = (today - dt.timedelta(days=1)).strftime("%d %b %Y")

    snapshots: dict[str, tuple[float | None, float | None, float | None]] = {}
    for name, tk in TICKERS.items():
        snapshots[name] = _last_and_changes(tk)

    # Energy
    b_last, b_d1, b_w1 = snapshots["BRENT"]
    w_last, w_d1, w_w1 = snapshots["WTI"]
    out["BRENT_LAST"] = _fmt(b_last)
    out["BRENT_D1_CHG_PCT"] = _pct(b_d1)
    out["BRENT_W1_CHG_PCT"] = _pct(b_w1)
    out["BRENT_D1_CHG_USD"] = _fmt(
        (b_last * (b_d1 / 100)) if (b_last and b_d1 is not None) else None
    )
    out["WTI_LAST"] = _fmt(w_last)
    out["WTI_D1_CHG_PCT"] = _pct(w_d1)
    out["WTI_W1_CHG_PCT"] = _pct(w_w1)
    out["WTI_D1_CHG_USD"] = _fmt(
        (w_last * (w_d1 / 100)) if (w_last and w_d1 is not None) else None
    )

    ng_last, ng_d1, ng_w1 = snapshots["NATGAS"]
    out["NATGAS_LAST"] = _fmt(ng_last, 3)
    out["NATGAS_D1_CHG_PCT"] = _pct(ng_d1)
    out["NATGAS_W1_CHG_PCT"] = _pct(ng_w1)

    gas_last, gas_d1, gas_w1 = snapshots["GASOIL"]
    out["GASOIL_LAST"] = _fmt(gas_last)
    out["GASOIL_D1_CHG_PCT"] = _pct(gas_d1)

    # Brent–WTI spread (proxy for Atlantic arb)
    if b_last is not None and w_last is not None:
        out["BRENT_WTI_SPREAD"] = _fmt(b_last - w_last)
    else:
        out["BRENT_WTI_SPREAD"] = "n/a"

    # Metals
    cu_last, cu_d1, cu_w1 = snapshots["COPPER"]
    out["COPPER_LME_3M"] = _fmt(cu_last * 2204.62, 0) if cu_last else "n/a"  # USD/t proxy
    out["COPPER_D1_CHG_PCT"] = _pct(cu_d1)
    out["COPPER_W1_CHG_PCT"] = _pct(cu_w1)

    au_last, au_d1, au_w1 = snapshots["GOLD"]
    out["GOLD_SPOT"] = _fmt(au_last)
    out["GOLD_D1_CHG_PCT"] = _pct(au_d1)
    out["GOLD_W1_CHG_PCT"] = _pct(au_w1)

    ag_last, ag_d1, ag_w1 = snapshots["SILVER"]
    out["SILVER_SPOT"] = _fmt(ag_last)
    out["SILVER_D1_CHG_PCT"] = _pct(ag_d1)

    pt_last, _, _ = snapshots["PLATINUM"]
    out["PLATINUM_SPOT"] = _fmt(pt_last)

    # Macro
    y10, y10_d1, _ = snapshots["US10Y"]
    out["US10Y_YIELD"] = _fmt(y10 / 10, 2) if y10 else "n/a"
    out["US10Y_CHG_BP"] = _fmt(y10_d1 * 10, 1) if y10_d1 is not None else "n/a"

    dxy_last, dxy_d1, _ = snapshots["DXY"]
    out["DXY_LAST"] = _fmt(dxy_last)
    out["DXY_D1_CHG_PCT"] = _pct(dxy_d1)

    spx_last, spx_d1, _ = snapshots["SPX"]
    out["SPX_LAST"] = _fmt(spx_last)
    out["SPX_D1_CHG_PCT"] = _pct(spx_d1)

    vix_last, _, _ = snapshots["VIX"]
    out["VIX_LAST"] = _fmt(vix_last)

    cnh_last, _, _ = snapshots["USDCNH"]
    out["USDCNH_LAST"] = _fmt(cnh_last, 4)
    eur_last, _, _ = snapshots["EURUSD"]
    out["EURUSD_LAST"] = _fmt(eur_last, 4)
    jpy_last, _, _ = snapshots["USDJPY"]
    out["USDJPY_LAST"] = _fmt(jpy_last, 2)

    # Items free APIs cannot reliably source — kept as flagged placeholders.
    for k in [
        "DUBAI_1M", "DUBAI_D1_CHG_PCT", "DUBAI_W1_CHG_PCT",
        "BRENT_DUBAI_EFS", "BRENT_1M2M_SPREAD", "WTI_1M2M_SPREAD",
        "GASOIL_CRACK_SING", "GASOIL_D1_CHG", "GASOIL_W1_CHG",
        "GASOLINE_CRACK_SING", "JET_SING_CRACK", "SING_FO380_CRACK",
        "SGO_CRACK", "DEC_DEC_CHG",
        "ALUMINIUM_LME_3M", "ALU_D1_CHG_PCT", "ALU_W1_CHG_PCT", "ALU_CASH_3M",
        "ZINC_LME_3M", "NICKEL_LME_3M", "NI_D1_CHG_PCT", "NI_W1_CHG_PCT",
        "LEAD_LME_3M", "COPPER_CASH_3M",
        "IRON_ORE_62pct_CHINA", "IRON_D1_CHG_PCT", "IRON_W1_CHG_PCT",
        "SGX_FRONT_3M", "COKING_COAL_CHINA", "REBAR_SHFE", "IRON_ORE_DALIAN_CHG",
        "EU_CARBON_PRICE", "EU_ETS_D1_CHG_PCT", "EU_ETS_W1_CHG_PCT", "EU_ETS_DEC_DEC",
        "UK_CARBON_PRICE", "UK_ETS_D1_CHG_PCT", "UK_ETS_W1_CHG_PCT", "UK_EUA_SPREAD",
        "CN_ETS_PRICE", "CN_ETS_D1_CHG_PCT", "CN_ETS_W1_CHG_PCT",
        "KOREA_ETS_PRICE", "KR_ETS_D1_CHG_PCT", "KR_ETS_W1_CHG_PCT",
        "RENEWABLE_CERT_PRICE", "EU_POLICY_HEADLINE", "CLEAN_SPARK_DE", "EU_CBAM_RATE",
        "JKM_LAST", "JKM_D1_CHG_PCT", "JKM_W1_CHG_PCT", "JKM_TTF_SPREAD", "TTF_LAST",
        "BUND_10Y_YIELD", "FED_SPEAKER", "FED_TONE", "FED_TERMINAL",
        "DATA_RELEASE_1_TIME", "DATA_RELEASE_1_CONSENSUS",
        "DATA_RELEASE_2_TIME", "DATA_RELEASE_2_CONSENSUS",
        "DATA_RELEASE_3_TIME", "DOE_TIME", "DOE_CRUDE_CONSENSUS", "CRUDE_API_CHG",
        "RED_SEA_STATUS", "RUSSIA_SANCTIONS_HEADLINE", "MIDDLE_EAST_HEADLINE",
        "BRENT_SUPPORT", "BRENT_RESISTANCE", "BRENT_DOWNSIDE_TARGET",
        "BRENT_3M_ATM_VOL", "BRENT_3M_25D_PUT_CALL",
        "CTA_COPPER_POSITIONING", "EUA_DEC_CALL_STRIKE", "AUDUSD_PIVOT",
        "RIO_ADR_CHG", "BHP_ADR_CHG", "COPPER_ETF_FLOW", "WEEKS_COUNT",
        "CHINA_CPI_TIME", "CN_STEEL_MARGIN", "US10Y_REAL",
    ]:
        out.setdefault(k, f"[{k}]")

    return out


if __name__ == "__main__":
    import json
    print(json.dumps(fetch_all(), indent=2))
