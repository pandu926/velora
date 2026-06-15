'use client'

import { useState, useEffect } from 'react'

interface PermissionNode {
  role: string
  address: string
  permissions: string[]
  children?: PermissionNode[]
}

const ROLE_STYLES: Record<string, { dot: string; badge: string; line: string; glow: string }> = {
  user: {
    dot: 'bg-gray-400',
    badge: 'bg-white/5 text-gray-200 border-white/10',
    line: 'border-gray-700',
    glow: '',
  },
  commander: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    line: 'border-amber-500/20',
    glow: 'glow-amber',
  },
  scout: {
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    line: 'border-emerald-500/20',
    glow: 'glow-green',
  },
  trader: {
    dot: 'bg-violet-400',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    line: 'border-violet-500/20',
    glow: 'glow-purple',
  },
  rebalancer: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    line: 'border-blue-500/20',
    glow: 'glow-blue',
  },
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface NodeCardProps {
  node: PermissionNode
  depth: number
  index: number
}

function NodeCard({ node, depth, index }: NodeCardProps) {
  const style = ROLE_STYLES[node.role] || ROLE_STYLES.user
  const roleName = node.role.charAt(0).toUpperCase() + node.role.slice(1)

  return (
    <div
      className={`${depth > 0 ? 'ml-4 sm:ml-8 mt-3' : ''} animate-fade-in`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={`relative glass ${style.badge} p-4 hover:bg-white/[0.08] transition-all duration-300`}>
        {depth > 0 && (
          <div className={`absolute -left-4 sm:-left-8 top-1/2 w-4 sm:w-8 h-px border-t border-dashed ${style.line}`} />
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            <span className="text-sm font-semibold text-white">{roleName}</span>
            <span className="text-[10px] font-mono text-gray-500">
              {truncateAddress(node.address)}
            </span>
          </div>
        </div>

        {node.permissions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {node.permissions.map(perm => (
              <span
                key={perm}
                className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-gray-400 border border-white/5"
              >
                {perm}
              </span>
            ))}
          </div>
        )}
      </div>

      {node.children && node.children.length > 0 && (
        <div className={`relative border-l border-dashed ${style.line} ml-4 sm:ml-5 pl-0`}>
          {node.children.map((child, idx) => (
            <NodeCard key={`${child.role}-${idx}`} node={child} depth={depth + 1} index={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

export function PermissionTree() {
  const [tree, setTree] = useState<PermissionNode | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const res = await fetch('/api/agents/permissions')
        if (res.ok) {
          const data = await res.json()
          setTree(data.tree ?? null)
        } else {
          setTree(null)
        }
      } catch {
        setTree(null)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPermissions()
  }, [])

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-16 bg-white/5 rounded-2xl" />
        <div className="ml-8 h-14 bg-white/5 rounded-2xl" />
        <div className="ml-16 h-12 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">No delegation hierarchy found.</p>
        <p className="text-gray-600 text-xs mt-1">Grant permissions to see the tree.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <NodeCard node={tree} depth={0} index={0} />
    </div>
  )
}
