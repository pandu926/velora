# Risk Analysis Framework — AI Boardroom Agents

Every agent in the boardroom MUST evaluate proposals using this standardized framework.
Do NOT assess risk based on gut feeling. Use these concrete criteria.

## Risk Scoring Matrix

### Position Size Risk
| Size vs Portfolio | Score | Label |
|-------------------|-------|-------|
| < 5% | 1 | Negligible |
| 5-15% | 2 | Low |
| 15-30% | 3 | Moderate |
| 30-50% | 4 | High |
| > 50% | 5 | Critical |

### Protocol Risk
| Criteria | Score 1 (Safe) | Score 3 (Moderate) | Score 5 (Dangerous) |
|----------|----------------|--------------------|--------------------|
| TVL | > $500M | $10M-$500M | < $10M |
| Age | > 2 years | 3-24 months | < 3 months |
| Audit | Multiple audits | Single audit | No audit |
| Track record | No exploits | Minor incident recovered | Major exploit |
| Code | Open source, verified | Open source | Closed/unverified |

### Market Condition Risk
| Signal | Score 1 (Favorable) | Score 3 (Neutral) | Score 5 (Unfavorable) |
|--------|--------------------|--------------------|----------------------|
| Fear & Greed | 40-60 (neutral) | 20-40 or 60-80 | < 20 or > 80 (extreme) |
| ETH 24h volatility | < 2% | 2-5% | > 5% |
| Funding rate | Near 0% | 0.01-0.05% | > 0.05% |
| Liquidations 24h | < $50M | $50-200M | > $200M |

### Action Type Risk
| Action | Base Risk | Notes |
|--------|-----------|-------|
| Supply stablecoin to Aave/Compound | 1 | Battle-tested, withdrawable anytime |
| Supply ETH to Aave/Compound | 2 | Asset price exposure + protocol risk |
| Small swap (< 10% portfolio) | 2 | Slippage bounded, small size |
| Large swap (> 30% portfolio) | 4 | Directional bet, significant exposure |
| New protocol yield farming | 4 | Smart contract risk, unproven |
| Leverage/looping | 5 | Liquidation risk, cascading failure |
| Withdraw to wallet (de-risk) | 1 | Reducing exposure, always safe |

## Composite Risk Score

```
Total Risk = (Position Size + Protocol + Market + Action Type) / 4
```

| Composite Score | Decision Guidance |
|----------------|-------------------|
| 1.0 - 2.0 | LOW RISK — vote YES unless specific evidence contradicts |
| 2.1 - 3.0 | MODERATE — vote based on quality of supporting evidence |
| 3.1 - 4.0 | HIGH RISK — vote NO unless overwhelming evidence supports |
| 4.1 - 5.0 | CRITICAL — vote NO, explain why this is dangerous |

## User Profile Override

When a user profile is provided in the evidence package:

| User Risk Appetite | Threshold Adjustment |
|-------------------|---------------------|
| Conservative | Treat composite 2.5+ as HIGH (vote NO) |
| Balanced | Use default thresholds above |
| Aggressive | Treat composite 3.5+ as HIGH (accept more risk) |

## Agent-Specific Focus

Each agent evaluates through their lens but MUST cite the risk matrix:

- **Market Analyst**: Focus on Market Condition Risk scores
- **Yield Researcher**: Compare APY vs risk-adjusted alternatives
- **Risk Officer**: Compute full composite score, flag if > 3.0
- **Sentiment Analyst**: Market Condition + social signals
- **Protocol Analyst**: Protocol Risk scoring (TVL, age, audit)
- **On-Chain Analyst**: Liquidity depth, whale movements affecting risk
- **Technical Auditor**: Protocol Risk (code, exploits, composability)
- **Macro Analyst**: Correlation risk, regulatory, systemic
- **Quant Strategist**: Position Size Risk + risk/reward ratio

## Output Requirement

Every agent MUST include in their response:
```json
{
  "vote": "yes/no",
  "confidence": 0.0-1.0,
  "reasoning": "Cite specific risk scores: Position=X, Protocol=X, Market=X, Action=X → Composite=X",
  "data": { "composite_risk": X.X, "key_factor": "..." }
}
```
