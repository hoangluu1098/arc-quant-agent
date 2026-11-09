# Arc Quant Agent

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

AI BTC/USD analysis and autonomous trading on Arc Testnet. Users deposit USDC into AIAgentVault, set agent limits, and the off-chain agent (server/agent.ts, `bun run agent`) opens/closes positions within them.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Deployed contracts (Arc Testnet, 5042002)

- AgentPriceFeed: 0x277504dfa44164f2d6e09c3c4773345c6872dbe6 (publisher = agent wallet)
- AIAgentVault: 0x433716cc717b3d4fd2094a4bcfe43fec3062f63e (deploy block 71475820)
- Agent wallet: 0x8Afc1736C4Fb1e6453035921f84Da01a3Fc0AdD3 (key in .env as AGENT_PRIVATE_KEY, never print it)
- Owner of both contracts is the shared platform deployer wallet.

## Notes

- Oracle is agent-fed because Pyth on Arc testnet is stale and Hermes needs a token. Swap in a Pyth/Chainlink adapter behind IPriceFeed for real value.
- The sandbox RPC proxy is read-only: the agent broadcasts through the public RPC.
- Analysis engine lives in src/lib/analysis.ts and is shared by the UI and the agent.
- UI language is Vietnamese.
