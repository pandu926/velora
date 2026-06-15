#!/usr/bin/env node

const BACKEND = 'http://localhost:8930'
const SCENARIOS = ['aave-supply', 'eth-swap-large', 'new-protocol-yield', 'small-rebalance', 'leverage-loop', 'withdraw-all']

async function runScenario(scenarioId) {
  const url = `${BACKEND}/api/agents/boardroom/stream?scenario=${scenarioId}`
  console.error(`Running: ${scenarioId}...`)

  const res = await fetch(url)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  const events = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        events.push(JSON.parse(line.slice(6)))
      } catch {}
    }
  }

  // Process remaining buffer
  if (buffer.startsWith('data: ')) {
    try { events.push(JSON.parse(buffer.slice(6))) } catch {}
  }

  const stances = events.filter(e => e.type === 'stance').map(e => e.stance)
  const challenges = events.filter(e => e.type === 'challenge_result').map(e => e.pair)
  const convictions = events.filter(e => e.type === 'conviction').map(e => e.lock)
  const tally = events.find(e => e.type === 'tally')?.result || null
  const verdictEvent = events.find(e => e.type === 'verdict')
  const verdict = verdictEvent?.session?.verdict || null

  return {
    scenarioId,
    timestamp: new Date().toISOString(),
    phases: events.filter(e => e.type === 'phase').map(e => e.phase),
    evidenceSources: events.find(e => e.type === 'evidence_ready')?.sourceCount || 0,
    stances: stances.map(s => ({
      agent: s.agentId,
      role: s.role,
      model: s.model,
      vote: s.vote,
      confidence: s.confidence,
      reasoning: s.reasoning,
      keyEvidence: s.keyEvidence,
      stake: s.stake,
    })),
    challenges: challenges.map(c => ({
      challenger: c.challenger,
      defender: c.defender,
      challengeArgument: c.challengeArgument,
      defenseResponse: c.defenseResponse,
    })),
    convictions: convictions.map(c => ({
      agent: c.agentId,
      role: c.role,
      originalVote: c.originalVote,
      finalVote: c.finalVote,
      decision: c.decision,
      reasoning: c.reasoning,
      weightMultiplier: c.weightMultiplier,
    })),
    tally,
    verdict: verdict ? {
      action: verdict.action,
      approved: verdict.approved,
      finalPercentage: verdict.finalPercentage,
      orchestratorSummary: verdict.orchestratorSummary,
    } : null,
    summary: {
      initialYes: stances.filter(s => s.vote === 'yes').length,
      initialNo: stances.filter(s => s.vote === 'no').length,
      holdCount: convictions.filter(c => c.decision === 'hold').length,
      flipCount: convictions.filter(c => c.decision === 'flip').length,
      abstainCount: convictions.filter(c => c.decision === 'abstain').length,
      challengePairs: challenges.length,
      staked: stances.filter(s => s.stake !== 'none').length,
    }
  }
}

async function main() {
  const results = []
  for (const id of SCENARIOS) {
    try {
      const result = await runScenario(id)
      results.push(result)
      const pct = result.tally?.weightedPercentage ? (result.tally.weightedPercentage * 100).toFixed(0) : '?'
      console.error(`  Done: ${id} → ${result.verdict?.approved ? 'APPROVED' : 'REJECTED'} (${pct}%) [${result.stances.length} stances, ${result.challenges.length} challenges, ${result.convictions.length} convictions]`)
    } catch (err) {
      console.error(`  FAILED: ${id} — ${err.message}`)
      results.push({ scenarioId: id, error: err.message })
    }
  }

  console.log(JSON.stringify({ runAt: new Date().toISOString(), scenarios: results }, null, 2))
}

main()
