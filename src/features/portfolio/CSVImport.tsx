'use client';

import { useRef, useState } from 'react';
import { Upload, X, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';

interface CSVImportProps {
  userId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  ticker: string;
  shares: number;
  costBasis: number;
  currency: string;
  companyName?: string;
  marketValue?: number;
}

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  symbol: 'ticker',
  ticker: 'ticker',
  quantity: 'shares',
  qty: 'shares',
  shares: 'shares',
  position: 'shares',
  'cost basis': 'costBasis',
  costbasis: 'costBasis',
  cost: 'costBasis',
  'avg price': 'costBasis',
  'average price': 'costBasis',
  'avg cost': 'costBasis',
  currency: 'currency',
  ccy: 'currency',
  description: 'companyName',
  name: 'companyName',
  'market value': 'marketValue',
  value: 'marketValue',
};

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/_/g, ' ');
}

function parseCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: ['File is empty'] };
  }

  const header = lines[0].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const colIndex: Partial<Record<keyof ParsedRow, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[normalize(h)];
    if (key && colIndex[key] === undefined) colIndex[key] = i;
  });

  if (colIndex.ticker === undefined) errors.push('Missing Symbol/Ticker column');
  if (colIndex.shares === undefined) errors.push('Missing Quantity/Shares column');
  if (colIndex.costBasis === undefined) errors.push('Missing Cost Basis/Price column');
  if (errors.length > 0) return { rows: [], errors };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const ticker = raw[colIndex.ticker!]?.toUpperCase();
    const sharesRaw = raw[colIndex.shares!];
    const costRaw = raw[colIndex.costBasis!];
    const shares = parseFloat(sharesRaw);
    const costBasis = parseFloat(costRaw);
    if (!ticker || !Number.isFinite(shares) || !Number.isFinite(costBasis)) continue;
    rows.push({
      ticker,
      shares,
      // If the provided value looks like total cost basis rather than per-share, divide
      costBasis:
        colIndex.costBasis !== undefined && shares !== 0 && costBasis > shares * 1000
          ? costBasis / shares
          : costBasis,
      currency:
        (colIndex.currency !== undefined && raw[colIndex.currency]) || 'USD',
      companyName:
        colIndex.companyName !== undefined ? raw[colIndex.companyName] : undefined,
      marketValue:
        colIndex.marketValue !== undefined
          ? parseFloat(raw[colIndex.marketValue])
          : undefined,
    });
  }
  return { rows, errors };
}

export function CSVImport({ userId, onClose, onImported }: CSVImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseErrors(['Please choose a .csv file']);
      return;
    }
    const text = await file.text();
    const result = parseCSV(text);
    setParseErrors(result.errors);
    setRows(result.errors.length === 0 ? result.rows : null);
  }

  async function doImport() {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const supabase = createClient();
      const inserts = rows.map((r) => ({
        user_id: userId,
        ticker: r.ticker,
        company_name: r.companyName ?? null,
        shares: r.shares,
        cost_basis: r.costBasis,
        currency: r.currency || 'USD',
      }));
      const { error } = await supabase.from('positions').insert(inserts);
      if (error) throw error;

      await supabase.from('sync_history').insert({
        user_id: userId,
        sync_type: 'csv_import',
        status: 'success',
        positions_updated: rows.length,
        trades_imported: 0,
      });

      onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-[720px] max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl glass-elevated p-6 md:p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-cerna-text-tertiary hover:text-cerna-text-primary transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-cerna-text-primary mb-1">Import positions from CSV</h2>
        <p className="text-sm text-cerna-text-secondary mb-5">
          Drop an IB (or any broker) positions export. Columns are auto-detected.
        </p>

        {!rows && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
              dragActive
                ? 'border-cerna-primary bg-[rgba(124,91,240,0.08)]'
                : 'border-cerna-border hover:border-cerna-border-hover'
            }`}
          >
            <Upload size={32} className="mx-auto text-cerna-text-tertiary mb-3" />
            <p className="text-cerna-text-secondary">Drag &amp; drop your CSV here</p>
            <p className="text-xs text-cerna-text-tertiary mt-1">or</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="mt-2 px-4 py-2 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white text-sm font-medium transition"
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-sm text-cerna-loss bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] rounded-lg p-3">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <ul className="list-disc list-inside space-y-0.5">
              {parseErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {rows && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-cerna-text-secondary">
                <FileText size={16} />
                {rows.length} position{rows.length === 1 ? '' : 's'} detected
              </div>
              <button
                onClick={() => {
                  setRows(null);
                  setParseErrors([]);
                }}
                className="text-xs text-cerna-text-tertiary hover:text-cerna-text-primary"
              >
                Choose a different file
              </button>
            </div>
            <div className="rounded-xl border border-cerna-border max-h-[260px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-cerna-bg-secondary">
                  <tr className="text-left text-xs uppercase text-cerna-text-tertiary">
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2 text-right">Shares</th>
                    <th className="px-3 py-2 text-right">Cost / share</th>
                    <th className="px-3 py-2 text-right">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.ticker}-${i}`} className="border-t border-cerna-border">
                      <td className="px-3 py-2 font-medium text-cerna-text-primary">{r.ticker}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.shares}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.costBasis)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && (
              <p className="mt-3 text-sm text-cerna-loss">{importError}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-cerna-border text-cerna-text-primary hover:border-cerna-border-hover transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={importing}
                className="flex-1 py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[44px] flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Import {rows.length}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
