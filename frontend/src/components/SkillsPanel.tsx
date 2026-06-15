'use client'

import { useState, useEffect, useCallback } from 'react'

// --- Types ---

interface SkillData {
  role: string
  version: number
  evolutionCount: number
  capabilities: string[]
  decisionRules: string[]
  constraints: string[]
  learnedPatterns: string[]
  lastEvolved?: string
}

interface EvolutionPatch {
  field: string
  action: 'add' | 'remove' | 'modify'
  value: string
  previousValue?: string
}

interface EvolutionEntry {
  id: string
  timestamp: string
  trigger: string
  outcome: string
  patches: EvolutionPatch[]
  version: number
}

// --- Sub-components ---

const AGENT_META: Record<string, { color: string; icon: string; title: string }> = {
  scout: {
    color: 'emerald',
    icon: 'M10 12a2 2 0 100-4 2 2 0 000 4z M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10z',
    title: 'Scout',
  },
  skeptic: {
    color: 'red',
    icon: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
    title: 'Skeptic',
  },
  judge: {
    color: 'amber',
    icon: 'M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z',
    title: 'Judge',
  },
  commander: {
    color: 'blue',
    icon: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z',
    title: 'Commander',
  },
}

function getColorClasses(color: string) {
  const map: Record<string, { bg: string; border: string; text: string; badge: string; dot: string }> = {
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300', dot: 'bg-emerald-400' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300', dot: 'bg-red-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300', dot: 'bg-blue-400' },
  }
  return map[color] || map.blue
}

function DiffLine({ patch }: { patch: EvolutionPatch }) {
  if (patch.action === 'add') {
    return (
      <div className="font-mono text-[11px] leading-relaxed">
        <span className="text-emerald-400">+ [{patch.field}]</span>{' '}
        <span className="text-emerald-300/80">{patch.value}</span>
      </div>
    )
  }

  if (patch.action === 'remove') {
    return (
      <div className="font-mono text-[11px] leading-relaxed">
        <span className="text-red-400">- [{patch.field}]</span>{' '}
        <span className="text-red-300/80">{patch.previousValue || patch.value}</span>
      </div>
    )
  }

  return (
    <div className="font-mono text-[11px] leading-relaxed space-y-0.5">
      <div>
        <span className="text-red-400">- [{patch.field}]</span>{' '}
        <span className="text-red-300/80">{patch.previousValue}</span>
      </div>
      <div>
        <span className="text-emerald-400">+ [{patch.field}]</span>{' '}
        <span className="text-emerald-300/80">{patch.value}</span>
      </div>
    </div>
  )
}

function EvolutionHistoryPanel({ role }: { role: string }) {
  const [history, setHistory] = useState<EvolutionEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/skills/${role}/history`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            setHistory(data)
          }
        }
      } catch {
        // Non-critical
      } finally {
        setIsLoading(false)
      }
    }
    fetchHistory()
  }, [role])

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2 py-2">
        <div className="h-16 bg-white/5 rounded-lg" />
        <div className="h-16 bg-white/5 rounded-lg" />
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <p className="text-xs text-gray-600 py-2">No evolution history yet. This skill has not evolved.</p>
    )
  }

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {history.map((entry) => (
        <div key={entry.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-gray-400">
              v{entry.version} — {entry.trigger}
            </span>
            <span className="text-[10px] text-gray-600 font-mono">
              {new Date(entry.timestamp).toLocaleDateString()}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mb-2 italic">{entry.outcome}</p>
          <div className="p-2 rounded bg-black/30 space-y-1">
            {entry.patches.map((patch, idx) => (
              <DiffLine key={idx} patch={patch} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SkillCard({ skill }: { skill: SkillData }) {
  const [showHistory, setShowHistory] = useState(false)
  const meta = AGENT_META[skill.role] || AGENT_META.commander
  const colors = getColorClasses(meta.color)

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 sm:p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center`}>
            <svg className={`w-3.5 h-3.5 ${colors.text}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d={meta.icon} clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className={`text-sm font-bold ${colors.text}`}>{meta.title}</h3>
            <span className="text-[10px] text-gray-600">{skill.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${colors.badge}`}>
            v{skill.version}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">
            {skill.evolutionCount} evolutions
          </span>
        </div>
      </div>

      {/* Capabilities */}
      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Capabilities</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {skill.capabilities.map((cap, idx) => (
            <span key={idx} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">
              {cap}
            </span>
          ))}
        </div>
      </div>

      {/* Decision Rules */}
      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Decision Rules</span>
        <div className="mt-1.5 space-y-1">
          {skill.decisionRules.map((rule, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-gray-600 text-[10px] mt-0.5 shrink-0">&#x25B8;</span>
              <span className="text-[11px] text-gray-400 leading-relaxed">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Constraints */}
      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Constraints</span>
        <div className="mt-1.5 space-y-1">
          {skill.constraints.map((constraint, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-red-500/60 text-[10px] mt-0.5 shrink-0">&#x2717;</span>
              <span className="text-[11px] text-gray-500 leading-relaxed">{constraint}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Learned Patterns - highlighted */}
      {skill.learnedPatterns.length > 0 && (
        <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/20">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11a1 1 0 11-2 0 1 1 0 012 0zm0-3a1 1 0 01-2 0V7a1 1 0 112 0v3z" />
            </svg>
            <span className="text-[10px] text-purple-300 uppercase tracking-wider font-bold">
              Learned Patterns
            </span>
            <span className="text-[10px] text-purple-500 font-mono">({skill.learnedPatterns.length})</span>
          </div>
          <div className="space-y-1">
            {skill.learnedPatterns.map((pattern, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-purple-400 text-[10px] mt-0.5 shrink-0">&#x2713;</span>
                <span className="text-[11px] text-purple-200/80 leading-relaxed">{pattern}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution History Toggle */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider font-medium"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showHistory ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Evolution History
        </button>

        {showHistory && (
          <div className="mt-3 animate-fade-in">
            <EvolutionHistoryPanel role={skill.role} />
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main Component ---

export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('scout')

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setSkills(data)
          setActiveTab(data[0].role)
        }
      }
    } catch {
      // Non-critical
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-white/5 rounded-xl w-64" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11a1 1 0 11-2 0 1 1 0 012 0zm0-3a1 1 0 01-2 0V7a1 1 0 112 0v3z" />
          </svg>
        </div>
        <p className="text-sm text-gray-400">No agent skills loaded yet.</p>
        <p className="text-xs text-gray-600 mt-1">Skills will appear after the agent system initializes.</p>
      </div>
    )
  }

  const activeSkill = skills.find(s => s.role === activeTab) || skills[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11a1 1 0 11-2 0 1 1 0 012 0zm0-3a1 1 0 01-2 0V7a1 1 0 112 0v3z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Self-Evolving Skills</h2>
          <p className="text-[10px] text-gray-500">Agent capabilities that grow from experience</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
        {skills.map((skill) => {
          const meta = AGENT_META[skill.role] || AGENT_META.commander
          const colors = getColorClasses(meta.color)
          const isActive = activeTab === skill.role

          return (
            <button
              key={skill.role}
              onClick={() => setActiveTab(skill.role)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                isActive
                  ? `${colors.bg} ${colors.text} border ${colors.border}`
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d={meta.icon} clipRule="evenodd" />
              </svg>
              {meta.title}
              {skill.evolutionCount > 0 && (
                <span className={`text-[9px] px-1 py-0 rounded-full ${isActive ? colors.badge : 'bg-white/10 text-gray-500'}`}>
                  {skill.evolutionCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Active Skill Card */}
      <SkillCard skill={activeSkill} />
    </div>
  )
}
