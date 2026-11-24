const PATHS = {
  pen: 'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3',
  eraser: 'M8 20h12M5 15l9-9a2 2 0 013 0l3 3a2 2 0 010 3l-8 8H9l-4-4a1.5 1.5 0 010-1z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clear: 'M5 5l14 14M19 5L5 19',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  onion: 'M4 8h10v10H4zM8 4h10v10',
  link: 'M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1',
  exit: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  sparkle: 'M12 3l1.8 5.4a2 2 0 001.3 1.3L20.5 11.5l-5.4 1.8a2 2 0 00-1.3 1.3L12 20l-1.8-5.4a2 2 0 00-1.3-1.3L3.5 11.5l5.4-1.8a2 2 0 001.3-1.3z',
  flame: 'M12 21a6 6 0 006-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 006 6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  timer: 'M12 22a8 8 0 100-16 8 8 0 000 16zM12 10v4l2.5 1.5M10 2h4M18.5 5.5l1.5-1.5',
  stop: 'M7 7h10v10H7z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
}

export default function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
