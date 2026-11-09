# Arc Quant Agent

An AI trading agent for BTC/USD on Arc Testnet. It reads live market data, scores the market with a multi-indicator model, and can open and close leveraged long or short positions with your USDC, strictly inside the limits you set.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Watch a live BTC/USD candle chart with the agent's signal (long, short or stay out), its confidence and the reasoning behind each indicator.
- Compare the trend on 5-minute, 15-minute, 1-hour and 1-day charts and see whether they agree.
- See a scenario forecast: the price range that recent volatility makes likely over the next 1, 3 or 6 hours, plus how price moved after similar signals earlier in the loaded data. This is a statistical range, not a prediction.
- See how the same rules would have performed on recent candles.
- Deposit USDC, switch the agent on, and cap its leverage and the margin it may use per trade.
- Trade manually, close any position at any time, and withdraw your free balance whenever you like.
- Review every trade onchain, including the reason the agent wrote with each decision.

Every position has a mandatory stop-loss and take-profit. The agent can never withdraw your funds.

## Important limits

- Testnet only. Use test USDC.
- Prices come from an oracle contract fed by the agent wallet, because the Pyth feed on Arc Testnet is stale. This is a trust assumption: do not use it with real funds.
- Profits are paid from a shared counterparty pool and capped at 100% of margin. USDC added to the pool is managed by the contract owner.
- Analysis is rule-based technical analysis, not financial advice, and past results do not predict future ones.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Solidity 0.8.28 with Foundry and OpenZeppelin. A Bun process runs the agent.

## Development

Prerequisites: Bun and Foundry.

```bash
bun install
bun run dev      # web app
bun run agent    # trading agent (separate terminal)
bun run check    # lint and typecheck
bun run contracts:build
```

The agent wallet needs a little test USDC for gas. Its address is `VITE_AGENT_ADDRESS`.

### Environment variables

- `VITE_VAULT_ADDRESS`: deployed vault contract.
- `VITE_FEED_ADDRESS`: deployed price feed contract.
- `VITE_AGENT_ADDRESS`: public address of the agent wallet.
- `VITE_VAULT_DEPLOY_BLOCK`: block where the vault was deployed, used to bound the trade history.
- `AGENT_PRIVATE_KEY`: private key of the agent wallet. Keep secret, never commit.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional outside Arc Studio. Read-only RPC used by the agent when present; otherwise it uses the public Arc Testnet RPC.
- `RPC_URL_Arc_Testnet`: optional RPC override for the agent.
