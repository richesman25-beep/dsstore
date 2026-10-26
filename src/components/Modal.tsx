import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
export default function Modal({ title, children, onClose, drawer = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')
        if (!nodes?.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handler); previous?.focus() }
  }, [onClose])
  return <div className={`modal-backdrop ${drawer ? 'is-drawer' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className={`modal ${drawer ? 'drawer' : ''} ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}><div className="modal-heading"><h2 id={id}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer / Fèmen"><X size={22}/></button></div>{children}</div></div>
}
