import { useMemo, useState } from 'react'
import { Modal } from './ModelProfileEditor'
import { Markdown } from './Markdown'
import { WIKI_ARTICLES, WIKI_CATEGORIES, type WikiArticle } from '../lib/wiki'
import { SearchIcon } from './Icons'

interface Props {
  onClose: () => void
  onReplayTour: () => void
}

function matches(a: WikiArticle, q: string): boolean {
  const hay = (a.title + ' ' + a.category + ' ' + a.keywords.join(' ') + ' ' + a.body).toLowerCase()
  return hay.includes(q)
}

export function WikiModal({ onClose, onReplayTour }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(WIKI_ARTICLES[0]?.id ?? '')

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? WIKI_ARTICLES.filter((a) => matches(a, q)) : WIKI_ARTICLES),
    [q],
  )

  const selected =
    filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? WIKI_ARTICLES.find((a) => a.id === selectedId)

  const byCategory = useMemo(() => {
    const map = new Map<string, WikiArticle[]>()
    for (const a of filtered) {
      if (!map.has(a.category)) map.set(a.category, [])
      map.get(a.category)!.push(a)
    }
    return map
  }, [filtered])

  return (
    <Modal title="Help & Wiki" onClose={onClose}>
      <div className="flex h-[34rem]">
        {/* Sidebar: search + article list */}
        <div className="flex w-64 shrink-0 flex-col border-r border-panel-600">
          <div className="border-b border-panel-600 p-2">
            <div className="flex items-center gap-2 rounded-md border border-panel-600 bg-panel-800 px-2">
              <SearchIcon width={13} height={13} className="text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the wiki…"
                className="w-full bg-transparent py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <button
              onClick={onReplayTour}
              className="mt-2 w-full rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent-hover hover:bg-accent/25"
            >
              ▶ Replay the guided tour
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-500">No articles match “{query}”.</p>
            )}
            {WIKI_CATEGORIES.map((cat) => {
              const items = byCategory.get(cat)
              if (!items || items.length === 0) return null
              return (
                <div key={cat} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {cat}
                  </div>
                  {items.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={`block w-full px-3 py-1.5 text-left text-sm ${
                        selected?.id === a.id
                          ? 'bg-panel-700 text-slate-100'
                          : 'text-slate-300 hover:bg-panel-800'
                      }`}
                    >
                      {a.title}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Article body */}
        <div className="min-w-0 flex-1 overflow-auto p-5">
          {selected ? (
            <>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-accent-hover">
                {selected.category}
              </div>
              <h2 className="mb-3 text-lg font-semibold text-slate-100">{selected.title}</h2>
              <Markdown>{selected.body}</Markdown>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select an article.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
