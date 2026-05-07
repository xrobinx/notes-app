import { useEffect, useState } from 'react'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    const unsub = window.api.on.windowStateChange(setIsMaximized)
    return unsub
  }, [])

  return (
    <div className="titlebar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div
        className="titlebar-controls"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <button
          className="traffic-btn traffic-minimize"
          onClick={() => window.api.window.minimize()}
          aria-label="Minimize"
          title="Minimize"
        >
          {isHovering && <span className="traffic-icon">-</span>}
        </button>
        <button
          className="traffic-btn traffic-maximize"
          onClick={() => window.api.window.maximize()}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isHovering && <span className="traffic-icon">{isMaximized ? '+' : '+'}</span>}
        </button>
        <button
          className="traffic-btn traffic-close"
          onClick={() => window.api.window.close()}
          aria-label="Close"
          title="Close"
        >
          {isHovering && <span className="traffic-icon">x</span>}
        </button>
      </div>
    </div>
  )
}
