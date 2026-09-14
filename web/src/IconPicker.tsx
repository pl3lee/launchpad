import { useState } from 'react'
import { AppIcon, iconOptions, type IconName } from './icons'

const groups = ['All', 'Web apps', 'General'] as const

export function IconPicker({
  value,
  onChange,
  disabled,
}: {
  value: IconName
  onChange: (icon: IconName) => void
  disabled: boolean
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<(typeof groups)[number]>('All')
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = iconOptions.filter((icon) =>
    (group === 'All' || icon.group === group) &&
    words.every((word) => `${icon.label} ${icon.name} ${icon.keywords}`.toLowerCase().includes(word)),
  )
  const selected = iconOptions.find((icon) => icon.name === value)

  return (
    <fieldset disabled={disabled} className="icon-field">
      <legend>Icon <span className="selected-icon-label">{selected?.label}</span></legend>
      <input
        type="search"
        aria-label="Search icons"
        placeholder="Search icons"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      <div className="icon-filters" role="group" aria-label="Icon category">
        {groups.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={group === category}
            onClick={() => setGroup(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="icon-picker" key={`${query}:${group}`} role="group" aria-label="Available icons">
        {matches.map((icon) => (
          <button
            key={icon.name}
            type="button"
            aria-label={`${icon.label} icon`}
            aria-pressed={value === icon.name}
            className={`icon-choice ${value === icon.name ? 'selected' : ''}`}
            onClick={() => onChange(icon.name)}
          >
            <AppIcon name={icon.name} size={24} />
            <span>{icon.label}</span>
          </button>
        ))}
        {matches.length === 0 ? <p className="icon-empty" role="status">No icons found. Try another search.</p> : null}
      </div>
    </fieldset>
  )
}
