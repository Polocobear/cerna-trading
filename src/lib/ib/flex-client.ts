/**
 * IB Flex Web Service client.
 *
 * Two-step protocol:
 *   1. SendRequest   → returns ReferenceCode + Url
 *   2. GetStatement  → poll with that reference until the report is ready
 *
 * See: https://www.interactivebrokers.com/en/software/am3/am/reports/flex_web_service.htm
 */

import { XMLParser } from 'fast-xml-parser';

export interface FlexPosition {
  symbol: string;
  exchange: string;
  currency: string;
  description: string;
  position: number;
  costBasisPrice: number; // per-share cost basis (IB attribute: costBasisPrice)
  markPrice: number;
  marketValue: number;
  fifoPnlUnrealized: number;
  fifoPnlRealized: number;
}

export interface FlexCashBalance {
  currency: string;
  endingCash: number;
}

export interface FlexTrade {
  tradeId: string;
  symbol: string;
  exchange: string;
  description: string;
  buySell: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  tradeMoney: number;
  commission: number;
  netCash: number;
  currency: string;
  tradeDate: string; // YYYY-MM-DD
  tradeDateTime: string; // ISO 8601 (UTC string)
  orderType: string;
  notes: string;
  assetCategory: string;
}

export interface FlexEquitySummary {
  reportDate: string;
  cash: number;
  stock: number;
  currency: string;
}

export interface FlexAccountInfo {
  accountId: string;
  currency: string;
  name: string;
  accountType: string;
}

export interface FlexTradeConfirm {
  symbol: string;
  exchange: string;
  buySell: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  commission: number;
  currency: string;
  tradeDate: string; // YYYYMMDD or ISO
  tradeTime: string;
}

export interface FlexActivityReport {
  positions: FlexPosition[];
  cashBalances: FlexCashBalance[];
  trades: FlexTrade[];
  equitySummary: FlexEquitySummary | null;
  accountInfo: FlexAccountInfo | null;
}

export interface FlexTradeConfirmReport {
  trades: FlexTradeConfirm[];
}

export class FlexError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'FlexError';
  }
}

const BASE_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
});

interface SendRequestResponse {
  status: string;
  referenceCode?: string;
  url?: string;
  errorCode?: string;
  errorMessage?: string;
}

function mapAuthError(errorCode: string | undefined, errorMessage: string | undefined): string {
  const msg = (errorMessage ?? '').toLowerCase();
  if (errorCode === '1003' || msg.includes('token')) {
    return 'Your IB Flex token may have expired. Please generate a new one.';
  }
  if (errorCode === '1012' || errorCode === '1001' || msg.includes('query')) {
    return 'Query ID not found. Please check your IB Flex Query setup.';
  }
  return errorMessage ?? 'IB Flex request failed';
}

async function fetchWithBackoff(url: string, attempt = 0): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Cerna-Trading/1.0',
        Accept: 'application/xml',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new FlexError(`IB returned ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 2) {
      if (err instanceof FlexError) throw err;
      throw new FlexError(err instanceof Error ? err.message : 'Network error reaching IB');
    }
    const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithBackoff(url, attempt + 1);
  }
}

function parseSendRequest(xml: string): SendRequestResponse {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.FlexStatementResponse ?? doc.flex_statement_response ?? {}) as Record<string, unknown>;
  const status = typeof root.Status === 'string' ? root.Status : 'Fail';
  return {
    status,
    referenceCode: root.ReferenceCode != null ? String(root.ReferenceCode) : undefined,
    url: root.Url != null ? String(root.Url) : undefined,
    errorCode: root.ErrorCode != null ? String(root.ErrorCode) : undefined,
    errorMessage: root.ErrorMessage != null ? String(root.ErrorMessage) : undefined,
  };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

/**
 * Convert IB's "YYYY-MM-DD,HH:MM:SS" datetime to ISO 8601 (UTC).
 * Falls back to tradeDate if dateTime is missing/malformed.
 */
function flexDateTimeToIso(dateTime: string, fallbackDate: string): string {
  if (dateTime) {
    const [datePart, timePart] = dateTime.split(',');
    if (datePart) {
      const time = timePart && timePart.length >= 8 ? timePart : '00:00:00';
      const iso = `${datePart}T${time}Z`;
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
  }
  if (fallbackDate) {
    const ms = Date.parse(`${fallbackDate}T00:00:00Z`);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function isCancellationTrade(t: Record<string, unknown>): boolean {
  const tradeId = str(t.tradeID).trim();
  if (!tradeId) return true;
  const buySell = str(t.buySell);
  const notes = str(t.notes);
  if (buySell.includes('(Ca.)') && notes.includes('Ca')) return true;
  return false;
}

/**
 * Parse an IB Activity Flex XML report.
 * Exposed for testing.
 */
export function parseActivityReport(xml: string): FlexActivityReport {
  const doc = parser.parse(xml) as Record<string, unknown>;

  // Error check — FlexStatementResponse is only returned on failure of step 2.
  const errResp = doc.FlexStatementResponse as Record<string, unknown> | undefined;
  if (errResp && errResp.Status === 'Fail') {
    throw new FlexError(mapAuthError(str(errResp.ErrorCode), str(errResp.ErrorMessage)));
  }

  const root = (doc.FlexQueryResponse ?? {}) as Record<string, unknown>;
  const stmts = toArray<Record<string, unknown>>(
    (root.FlexStatements as Record<string, unknown> | undefined)?.FlexStatement as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined
  );

  const positions: FlexPosition[] = [];
  const cashBalances: FlexCashBalance[] = [];
  const trades: FlexTrade[] = [];
  let equitySummary: FlexEquitySummary | null = null;
  let accountInfo: FlexAccountInfo | null = null;

  for (const stmt of stmts) {
    // Account information
    const accInfoRaw = stmt.AccountInformation as Record<string, unknown> | undefined;
    if (accInfoRaw && !accountInfo) {
      accountInfo = {
        accountId: str(accInfoRaw.accountId),
        currency: str(accInfoRaw.currency),
        name: str(accInfoRaw.name),
        accountType: str(accInfoRaw.accountType),
      };
    }

    const openPositions = toArray<Record<string, unknown>>(
      (stmt.OpenPositions as Record<string, unknown> | undefined)?.OpenPosition as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined
    );
    for (const p of openPositions) {
      positions.push({
        symbol: str(p.symbol),
        exchange: str(p.listingExchange || p.exchange),
        currency: str(p.currency),
        description: str(p.description),
        position: num(p.position),
        costBasisPrice: num(p.costBasisPrice),
        markPrice: num(p.markPrice),
        marketValue: num(p.positionValue ?? num(p.markPrice) * num(p.position)),
        fifoPnlUnrealized: num(p.fifoPnlUnrealized),
        fifoPnlRealized: num(p.fifoPnlRealized),
      });
    }

    const cash = toArray<Record<string, unknown>>(
      (stmt.CashReport as Record<string, unknown> | undefined)?.CashReportCurrency as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined
    );
    for (const c of cash) {
      const currency = str(c.currency);
      if (!currency || currency === 'BASE_SUMMARY') continue;
      cashBalances.push({
        currency,
        endingCash: num(c.endingCash),
      });
    }

    // Trades from Activity flex (separate from <TradeConfirms>)
    const tradeRows = toArray<Record<string, unknown>>(
      (stmt.Trades as Record<string, unknown> | undefined)?.Trade as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined
    );
    for (const t of tradeRows) {
      const assetCategory = str(t.assetCategory);
      // Skip FX (e.g. EUR.AUD) — only sync stock trades.
      if (assetCategory === 'CASH') continue;
      if (isCancellationTrade(t)) continue;

      const buySellRaw = str(t.buySell).toUpperCase();
      const buySell: 'BUY' | 'SELL' = buySellRaw.startsWith('SELL') ? 'SELL' : 'BUY';
      const tradeDate = str(t.tradeDate);
      const dateTime = str(t.dateTime);
      trades.push({
        tradeId: str(t.tradeID).trim(),
        symbol: str(t.symbol),
        exchange: str(t.listingExchange || t.exchange),
        description: str(t.description),
        buySell,
        quantity: Math.abs(num(t.quantity)),
        price: num(t.tradePrice),
        tradeMoney: Math.abs(num(t.tradeMoney)),
        commission: Math.abs(num(t.ibCommission)),
        netCash: num(t.netCash),
        currency: str(t.currency),
        tradeDate,
        tradeDateTime: flexDateTimeToIso(dateTime, tradeDate),
        orderType: str(t.orderType),
        notes: str(t.notes),
        assetCategory,
      });
    }

    // Equity summary — pick the row with the latest reportDate.
    const equityRows = toArray<Record<string, unknown>>(
      (stmt.EquitySummaryInBase as Record<string, unknown> | undefined)?.EquitySummaryByReportDateInBase as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined
    );
    for (const e of equityRows) {
      const reportDate = str(e.reportDate);
      if (!reportDate) continue;
      if (!equitySummary || reportDate > equitySummary.reportDate) {
        equitySummary = {
          reportDate,
          cash: num(e.cash),
          stock: num(e.stock),
          currency: str(e.currency),
        };
      }
    }
  }

  return { positions, cashBalances, trades, equitySummary, accountInfo };
}

/**
 * Parse an IB Trade Confirmation Flex XML report.
 * Exposed for testing.
 */
export function parseTradeConfirmReport(xml: string): FlexTradeConfirmReport {
  const doc = parser.parse(xml) as Record<string, unknown>;

  const errResp = doc.FlexStatementResponse as Record<string, unknown> | undefined;
  if (errResp && errResp.Status === 'Fail') {
    throw new FlexError(mapAuthError(str(errResp.ErrorCode), str(errResp.ErrorMessage)));
  }

  const root = (doc.FlexQueryResponse ?? {}) as Record<string, unknown>;
  const stmts = toArray<Record<string, unknown>>(
    (root.FlexStatements as Record<string, unknown> | undefined)?.FlexStatement as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined
  );

  const trades: FlexTradeConfirm[] = [];
  for (const stmt of stmts) {
    const confirms = toArray<Record<string, unknown>>(
      (stmt.TradeConfirms as Record<string, unknown> | undefined)?.TradeConfirm as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined
    );
    for (const t of confirms) {
      const side = str(t.buySell).toUpperCase();
      trades.push({
        symbol: str(t.symbol),
        exchange: str(t.exchange || t.listingExchange),
        buySell: side === 'SELL' ? 'SELL' : 'BUY',
        quantity: Math.abs(num(t.quantity)),
        price: num(t.price),
        commission: Math.abs(num(t.commission)),
        currency: str(t.currency),
        tradeDate: str(t.tradeDate),
        tradeTime: str(t.tradeTime),
      });
    }
  }

  return { trades };
}

async function sendRequest(token: string, queryId: string): Promise<SendRequestResponse> {
  const url = `${BASE_URL}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(
    queryId
  )}&v=3`;
  const xml = await fetchWithBackoff(url);
  const parsed = parseSendRequest(xml);
  if (parsed.status !== 'Success' || !parsed.referenceCode || !parsed.url) {
    throw new FlexError(mapAuthError(parsed.errorCode, parsed.errorMessage));
  }
  return parsed;
}

async function fetchStatement(
  statementUrl: string,
  token: string,
  referenceCode: string
): Promise<string> {
  const url = `${statementUrl}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(
    token
  )}&v=3`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const body = await fetchWithBackoff(url);
    // If still processing, IB returns FlexStatementResponse with Status=Warn + ErrorCode=1019
    const doc = parser.parse(body) as Record<string, unknown>;
    const errResp = doc.FlexStatementResponse as Record<string, unknown> | undefined;
    if (errResp) {
      const status = str(errResp.Status);
      const code = str(errResp.ErrorCode);
      if (status === 'Warn' || code === '1019') {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (status === 'Fail') {
        throw new FlexError(mapAuthError(code, str(errResp.ErrorMessage)));
      }
    }
    // FlexQueryResponse is the success payload
    if (doc.FlexQueryResponse) return body;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new FlexError('IB is taking longer than usual. Will retry automatically.');
}

export async function fetchActivityReport(
  token: string,
  queryId: string
): Promise<FlexActivityReport> {
  const send = await sendRequest(token, queryId);
  const xml = await fetchStatement(send.url!, token, send.referenceCode!);
  return parseActivityReport(xml);
}

export async function fetchTradeConfirmReport(
  token: string,
  queryId: string
): Promise<FlexTradeConfirmReport> {
  const send = await sendRequest(token, queryId);
  const xml = await fetchStatement(send.url!, token, send.referenceCode!);
  return parseTradeConfirmReport(xml);
}

/**
 * Test a flex connection by fetching the activity report once.
 * Used by the setup wizard before saving credentials.
 */
export async function testFlexConnection(
  token: string,
  queryId: string
): Promise<{ ok: true; positions: number; cashCurrencies: number } | { ok: false; error: string }> {
  try {
    const report = await fetchActivityReport(token, queryId);
    return {
      ok: true,
      positions: report.positions.length,
      cashCurrencies: report.cashBalances.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'IB connection test failed',
    };
  }
}
