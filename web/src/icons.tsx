import {
  Bookmark,
  Cloud,
  Gamepad2,
  Globe2,
  Headphones,
  Home,
  Map,
  Music2,
  Navigation,
  Play,
  Radio,
  Tv,
} from 'lucide-react'

export const iconNames = [
  'globe',
  'play',
  'music',
  'headphones',
  'navigation',
  'map',
  'home',
  'cloud',
  'radio',
  'gamepad',
  'bookmark',
  'tv',
  'youtube',
  'netflix',
  'spotify',
  'plex',
] as const
export const colorNames = ['silver', 'coral', 'amber', 'mint', 'blue', 'violet'] as const
export type IconName = (typeof iconNames)[number]
export type ColorName = (typeof colorNames)[number]
const generic = {
  globe: Globe2,
  play: Play,
  music: Music2,
  headphones: Headphones,
  navigation: Navigation,
  map: Map,
  home: Home,
  cloud: Cloud,
  radio: Radio,
  gamepad: Gamepad2,
  bookmark: Bookmark,
  tv: Tv,
}
export function AppIcon({ name, size = 32 }: { name: string; size?: number }) {
  if (name in generic) {
    const Icon = generic[name as keyof typeof generic]
    return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      {name === 'youtube' ? (
        <>
          <rect x="2" y="6" width="28" height="20" rx="6" />
          <path d="m13 11 9 5-9 5z" fill="var(--icon-bg)" />
        </>
      ) : null}
      {name === 'netflix' ? (
        <>
          <path d="M8 3h5v26H8zM19 3h5v26h-5z" />
          <path d="M8 3h5l11 26h-5z" opacity=".7" />
        </>
      ) : null}
      {name === 'spotify' ? (
        <>
          <circle cx="16" cy="16" r="14" />
          <g fill="none" stroke="var(--icon-bg)" strokeWidth="2.4" strokeLinecap="round">
            <path d="M8 12c5-2 12-1 17 2M9 17c5-2 10-1 14 1M10 22c4-1 8-1 11 1" />
          </g>
        </>
      ) : null}
      {name === 'plex' ? <path d="M8 3h9l10 13-10 13H8l10-13z" /> : null}
    </svg>
  )
}
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
