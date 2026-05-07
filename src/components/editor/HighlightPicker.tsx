import { useState } from 'react'
import './HighlightPicker.css'

interface Props {
  selectedColor: string
  opacity: number
  onPreview: (color: string, opacity: number) => void
  onApply: (color: string, opacity: number) => void
  onClear: () => void
  onClose: () => void
}

const PRESET_COLORS = [
  '#ffd60a', '#ff9f0a', '#ff453a', '#ff2d55',
  '#bf5af2', '#0a84ff', '#32d74b', '#64d2ff',
  '#30d158', '#ffffff', '#8e8e93', '#000000',
]

export function HighlightPicker({ selectedColor, opacity, onPreview, onApply, onClear, onClose }: Props) {
  const [customColor, setCustomColor] = useState(selectedColor)

  return (
    <div className="highlight-picker scale-in">
      <div className="highlight-picker-label">Highlight Color</div>

      <div className="highlight-presets">
        {PRESET_COLORS.map(color => (
          <button
            key={color}
            className={`highlight-swatch ${selectedColor === color ? 'selected' : ''}`}
            style={{ background: color }}
            onMouseEnter={() => onPreview(color, opacity)}
            onClick={() => onApply(color, opacity)}
            title={color}
          />
        ))}
      </div>

      <div className="highlight-custom-row">
        <input
          type="color"
          value={customColor}
          onChange={e => {
            setCustomColor(e.target.value)
            onPreview(e.target.value, opacity)
          }}
          className="highlight-color-input"
          title="Custom color"
        />
        <span className="highlight-custom-label">Custom</span>
        <button className="highlight-apply-btn" onClick={() => onApply(customColor, opacity)}>
          Apply
        </button>
      </div>

      <div className="highlight-opacity-row">
        <span className="highlight-opacity-label">Intensity</span>
        <input
          type="range"
          min={10}
          max={100}
          value={opacity}
          onChange={e => onPreview(selectedColor, Number(e.target.value))}
          className="highlight-opacity-slider"
        />
        <span className="highlight-opacity-value">{opacity}%</span>
      </div>

      <button className="highlight-clear-btn" onClick={onClear}>
        Remove Highlight
      </button>
    </div>
  )
}
