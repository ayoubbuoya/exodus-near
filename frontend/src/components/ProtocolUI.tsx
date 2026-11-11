import { ArrowRight, ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { parseUnits } from '../lib/formatters';

export function AmountField({
  label,
  value,
  onChange,
  token,
  balance,
  onMax,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  token: string;
  balance?: string;
  onMax?: () => void;
}) {
  const id = useId();
  let validation: string | null = null;
  try {
    parseUnits(value);
  } catch (error) {
    validation =
      error instanceof Error ? error.message : 'Enter a valid decimal amount.';
  }
  return (
    <div className="amount-field">
      <div className="amount-label">
        <label htmlFor={id}>{label}</label>
        {balance !== undefined && (
          <span>
            Balance: <b>{balance}</b>
            {onMax && (
              <button type="button" onClick={onMax}>
                MAX
              </button>
            )}
          </span>
        )}
      </div>
      <div className="amount-input-row">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          value={value}
          aria-invalid={!!validation}
          aria-describedby={validation ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className={`amount-token ${token === 'YT' ? 'yield-ink' : ''}`}>
          <span
            className={`mini-token ${token === 'YT' ? 'mini-token-yt' : ''}`}
          >
            {token === 'PT' || token === 'YT' ? token : 'N'}
          </span>
          {token}
        </span>
      </div>
      {validation && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {validation}
        </p>
      )}
    </div>
  );
}
export function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
export function FormNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`form-notice ${error ? 'form-error' : ''}`}
      role={error ? 'alert' : 'note'}
    >
      {children}
    </div>
  );
}
export function ActionButton({
  children,
  disabled,
  busy,
}: {
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button type="submit" className="action-button" disabled={disabled || busy}>
      {busy ? 'Waiting for confirmation…' : children}
      {!busy && <ArrowRight size={16} />}
    </button>
  );
}
export function SlippageControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const name = useId();
  return (
    <details className="trade-settings">
      <summary>
        Transaction settings{' '}
        <span>
          {(value / 100).toFixed(1)}% slippage <ChevronDown size={13} />
        </span>
      </summary>
      <fieldset>
        <legend>Slippage tolerance</legend>
        {[10, 50, 100].map((bps) => (
          <label key={bps}>
            <input
              type="radio"
              name={name}
              value={bps}
              checked={value === bps}
              onChange={() => onChange(bps)}
            />
            {bps / 100}%
          </label>
        ))}
      </fieldset>
    </details>
  );
}
