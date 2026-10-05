import { useEffect, useRef, useState } from 'react'

// Text input that keeps a local draft, saves on blur (or Enter for single-line),
// and accepts live updates from teammates while it is not being edited.
export default function InlineInput({ value, onSave, multiline = false, type = 'text', className = '', ...rest }) {
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value ?? '')
  }, [value])

  const commit = () => {
    focused.current = false
    const current = value ?? ''
    if (String(draft) !== String(current)) onSave(draft)
  }

  const common = {
    value: draft,
    className,
    onFocus: () => (focused.current = true),
    onBlur: commit,
    onChange: (e) => setDraft(e.target.value),
    onKeyDown: (e) => {
      if (e.key === 'Escape') {
        setDraft(value ?? '')
        focused.current = false
        e.currentTarget.blur()
      }
      if (!multiline && e.key === 'Enter') e.currentTarget.blur()
    },
    ...rest,
  }

  if (multiline) return <textarea rows={3} {...common} />
  return <input type={type} {...common} />
}
