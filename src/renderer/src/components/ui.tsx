import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Plate({ title, tag, children, className = '' }: { title?: string; tag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`plate ${className}`}>
      <span className="rivet tl" />
      <span className="rivet tr" />
      <span className="rivet bl" />
      <span className="rivet br" />
      {(title || tag) && (
        <header className="plate-header">
          {title && <h2>{title}</h2>}
          {tag}
        </header>
      )}
      {children}
    </section>
  )
}

type Variant = 'yellow' | 'cyan' | 'steel' | 'danger'

export function Button({ variant = 'yellow', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`btn btn-${variant} ${className}`} />
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="label">{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Check({ size = 44 }: { size?: number }) {
  return (
    <svg className="check" width={size} height={size} viewBox="0 0 48 48" aria-label="Granted">
      <circle cx="24" cy="24" r="21" fill="#5bd14a" stroke="#141110" strokeWidth="4" />
      <path d="M13 25 L21 33 L36 16" fill="none" stroke="#141110" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 25 L21 33 L36 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Cross({ size = 44 }: { size?: number }) {
  return (
    <svg className="cross" width={size} height={size} viewBox="0 0 48 48" aria-label="Not granted">
      <circle cx="24" cy="24" r="21" fill="#e2402f" stroke="#141110" strokeWidth="4" />
      <g stroke="#141110" strokeWidth="6" strokeLinecap="round">
        <line x1="16" y1="16" x2="32" y2="32" />
        <line x1="32" y1="16" x2="16" y2="32" />
      </g>
    </svg>
  )
}
