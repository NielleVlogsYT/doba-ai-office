import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  label: string
  header: ReactNode
  footer?: ReactNode
  children: ReactNode
  onClose: () => void
}

export function Panel({ label, header, footer, children, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The panel is remounted for each view; closing is the only reason to listen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={label}>
      <button className="drawer-scrim" onClick={onClose} aria-label="Close panel" tabIndex={-1} />
      <aside className="drawer">
        <header className="drawer-head">
          {header}
          <button ref={closeRef} className="icon-btn close-btn" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  )
}
