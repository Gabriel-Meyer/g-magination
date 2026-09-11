import type { CSSProperties, ReactNode } from 'react'

interface PaperPrintProps {
  src: string
  alt: string
  /** Resting rotation, e.g. "-2deg" — the print straightens when picked up. */
  rotate?: string
  /** Rendered on the white bottom margin of the print, polaroid-style. */
  caption?: ReactNode
  aspectClassName?: string
  className?: string
}

/**
 * A photo as a physical print lying on the table: white paper border, nearly
 * square corners, a slight resting tilt. Styles in index.css (.paper-print).
 */
export function PaperPrint({
  src,
  alt,
  rotate = '0deg',
  caption,
  aspectClassName = 'aspect-[4/5]',
  className = '',
}: PaperPrintProps) {
  return (
    <figure
      className={`paper-print ${className}`.trim()}
      style={{ '--rot': rotate } as CSSProperties}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${aspectClassName} w-full object-cover`}
      />
      {caption && <figcaption className="px-1 pb-1 pt-3">{caption}</figcaption>}
    </figure>
  )
}
