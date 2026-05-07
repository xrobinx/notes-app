import { useState } from 'react'
import './TableGrid.css'

interface Props {
  onSelect: (rows: number, cols: number) => void
  onClose: () => void
}

const MAX = 8

export function TableGrid({ onSelect, onClose }: Props) {
  const [hovered, setHovered] = useState({ rows: 0, cols: 0 })

  return (
    <div className="table-grid-popup scale-in">
      <div className="table-grid-label">
        {hovered.rows > 0
          ? `${hovered.rows} x ${hovered.cols} table`
          : 'Choose table size'}
      </div>
      <div
        className="table-grid-cells"
        onMouseLeave={() => setHovered({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: MAX }, (_, row) =>
          Array.from({ length: MAX }, (_, col) => (
            <div
              key={`${row}-${col}`}
              className={`table-grid-cell ${
                row < hovered.rows && col < hovered.cols ? 'highlighted' : ''
              }`}
              onMouseEnter={() => setHovered({ rows: row + 1, cols: col + 1 })}
              onClick={() => {
                onSelect(hovered.rows || 1, hovered.cols || 1)
                onClose()
              }}
            />
          ))
        )}
      </div>
    </div>
  )
}
