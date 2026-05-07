import { useState } from 'react'
import './TextColorPicker.css'

const COLORS = [
  '#f5f5f7', '#8e8e93', '#ffd60a', '#ff9f0a',
  '#ff453a', '#ff375f', '#bf5af2', '#0a84ff',
  '#64d2ff', '#32d74b', '#30d158', '#ffffff',
]

interface Props {
  selectedColor: string
  onPreview: (color: string) => void
  onApply: (color: string) => void
  onClear: () => void
}

export function TextColorPicker({ selectedColor, onPreview, onApply, onClear }: Props) {
  const [customColor, setCustomColor] = useState(selectedColor)

  return (
    <div className="text-color-picker scale-in">
      <div className="text-color-label">Text Color</div>
      <div className="text-color-presets">
        {COLORS.map(color => (
          <button
            key={color}
            className={`text-color-swatch ${selectedColor === color ? 'selected' : ''}`}
            style={{ background: color }}
            onClick={() => onApply(color)}
            title={color}
          />
        ))}
      </div>

      <div className="text-color-custom-row">
        <input
          type="color"
          value={customColor}
          onChange={event => {
            setCustomColor(event.target.value)
            onPreview(event.target.value)
          }}
          className="text-color-input"
        />
        <span className="text-color-custom-label">Custom</span>
        <button className="text-color-apply-btn" onClick={() => onApply(customColor)}>
          Apply
        </button>
      </div>

      <button className="text-color-clear-btn" onClick={onClear}>
        Reset Text Color
      </button>
    </div>
  )
}
