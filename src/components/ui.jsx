import React, { useEffect, useRef, useState } from 'react';

const PATHS = {
  bell: 'M12 3a6 6 0 0 0-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0',
  bellOn: 'M12 3a6 6 0 0 0-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-2.5.1-1-.1-1 2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5-.1 1 .1 1-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5z',
  close: 'M6 6l12 12M18 6L6 18',
  cal: 'M4 8h16M7 3v4M17 3v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5',
  share: 'M12 15V4m0 0L8 8m4-4l4 4M5 13v6h14v-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 15h2',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  pin: 'M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  down: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
};

export const Icon = ({ name, size = 20, className = '' }) => (
  <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} fill={name === 'bellOn' ? 'currentColor' : 'none'} />
  </svg>
);

// Team logo with a coloured-initials fallback if the image is missing or blocked.
export function Logo({ src, name = '', color, size = 40 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = { width: size, height: size };
  if (!src || bad) {
    return (
      <span className="logo logo-fallback" style={{ ...style, background: color || 'var(--surface-3)', fontSize: size * 0.36 }}>
        {initials}
      </span>
    );
  }
  return <img className="logo" style={style} src={src} alt="" loading="lazy" onError={() => setBad(true)} />;
}

export function Sheet({ title, onClose, children, wide }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className={`scrim ${closing ? 'out' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`sheet ${wide ? 'wide' : ''} ${closing ? 'out' : ''}`}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{typeof children === 'function' ? children(close) : children}</div>
      </section>
    </div>
  );
}

export const Toggle = ({ on, onChange, label, hint }) => (
  <label className="toggle-row">
    <span>
      <b>{label}</b>
      {hint && <small>{hint}</small>}
    </span>
    <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
    <i className="switch" aria-hidden="true" />
  </label>
);
