import { Tooltip } from 'antd';

interface CpaHealthTooltipProps {
  target?: number | null;
  lastActivity?: string | null;
  formatTarget?: (n: number) => string;
  children: React.ReactNode;
}

/** Shared CPA health legend tooltip — used on campaign detail + geo tracks */
export function CpaHealthTooltip({ target, lastActivity, formatTarget, children }: CpaHealthTooltipProps): React.ReactNode {
  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          {target != null && formatTarget && <div style={{ marginBottom: 4 }}>Target: {formatTarget(target)}</div>}
          <div><span style={{ color: 'var(--color-success)' }}>●</span> Good — within 5% of target</div>
          <div><span style={{ color: 'var(--color-warning)' }}>●</span> Warning — 5–25% over target</div>
          <div><span style={{ color: 'var(--color-error)' }}>●</span> Over target — more than 25% over</div>
          {lastActivity && <div style={{ marginTop: 4, color: 'var(--color-gray-400)' }}>Last activity: {lastActivity}</div>}
        </div>
      }
      mouseEnterDelay={0.15}
    >
      {children}
    </Tooltip>
  );
}
