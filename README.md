# Swapr Contracts

Swapr is a set of upgradeable Solidity smart contracts that power a **signature-driven NFT marketplace** for [Lokr](https://lokr.io)-style locked assets. It lets users list, auction, and trade ERC‑721 "lock" NFTs — including **fractional (split) sales** — while keeping funds and assets custodied in a dedicated wallet contract and charging configurable, oracle-priced fees.

The system is intentionally **off-chain orchestrated, on-chain settled**: listings, bids, and orders are constructed and signed off-chain (by the seller and a trusted marketplace key), then submitted on-chain where signatures are verified and assets/funds are moved atomically.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Contracts](#core-contracts)
- [Key Concepts](#key-concepts)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Building & Testing](#building--testing)
- [Deployment](#deployment)
- [Creating a Listing (example script)](#creating-a-listing-example-script)
- [Security Notes](#security-notes)
- [License](#license)

---

## Overview

Swapr enables two listing types for NFTs that represent locked/vesting assets:

| Listing type | `listingType` / `depositType` | Description |
|--------------|-------------------------------|-------------|
| **Auction**  | `1` | Time-bounded bidding with optional buy-now price. Highest valid bid wins; seller and buyer each `claim()` their side after the auction ends. |
| **Order**    | `2` | Fixed-price sale. Supports **partial / split purchases**, where a buyer can buy a configurable percentage of the NFT and the remainder stays listed. |

Every state-changing action requires valid ECDSA signatures:

- The **seller** signs the listing/order/bid payload.
- The **marketplace** (a trusted EOA) co-signs the wrapped payload, preventing forged or replayed listings.

Assets and funds never sit in the marketplace logic contract — they are held by `SwaprWallet`, and only contracts holding the correct role can move them.

---

## Architecture

```
                         off-chain (signed payloads)
        seller ───sig──┐
                       ▼
   marketplace ─sig─► SwaprGL  ──────────────► SwaprFee
   (trusted EOA)      (listings, orders,        (fee config, oracle
                       auctions, claims,         pricing, discounts,
                       buy-now, withdraws)       LKR/token payments)
                          │
                          │ SWAPRGL_ROLE
                          ▼
                      SwaprWallet
                  (custody of NFTs, ETH/native
                   & ERC-20 balances, split logic)
                          │
                          ▼
                   ILock ERC-721 proxy
                 (external Lokr lock + SplitManager)
```

All three core contracts are **UUPS upgradeable proxies** (OpenZeppelin) and share a common governance base (`BaseGovernanceWithUserUpgradable`) for role-based access control and authorized upgrades.

---

## Core Contracts

### `SwaprGL.sol` — Marketplace logic
The main entry point. Validates marketplace + seller signatures and orchestrates listings end-to-end:

- `depositNFTs` — deposit a lock NFT to be listed later (`depositType == 3`).
- `createListing` / `updateListing` — open or amend an Auction (`1`) or Order (`2`) listing; requires the upfront base fee to have been paid into `SwaprFee`.
- `buyNowOrder` — buy all or a **split portion** of a fixed-price order; remaining part is re-locked and stays listed.
- `buyNowAuction` — instantly purchase an auction at its buy-now price.
- `claim` — settle an ended auction for either the seller (funds) or winning bidder (NFT).
- `withdrawNFT` / `withdrawFunds` — withdraw unlocked assets/balances.
- `payNow` / internal pay helpers — route payments either from a buyer's in-wallet balance (`_payFromWallet`) or as an upfront native/ERC‑20 transfer (`_payUpfront`), deducting the final fee to the fee receiver.
- Admin: `attachNewWallet`, `attachNewFeeContract`, `attachNewMarketplace`, `updateTimeOffset`, `setListingUpdateTime`.

### `SwaprWallet.sol` — Asset & fund custody
Holds all NFTs and balances; only callable by the holder of `SWAPRGL_ROLE`.

- NFT custody: `lockNFT`, `updateLockedNFT`, `releaseNFT`, `disposeNFT`, `isNFTLocked`, `getNFT`.
- Splitting: `splitReleaseNFT`, `splitLockedPart`, `getLockedPart` (delegates to the lock's `SplitManager`).
- Native funds: `depositNative`, `depositNativeSwapr`, `swapNative`, `releaseNative`.
- ERC‑20 funds: `depositERC`, `depositERCSwapr`, `swapERC`, `releaseERC`.
- `getBalance` returns **unlocked** balance only (locked funds backing live bids are excluded).

### `SwaprFee.sol` — Fee engine & pricing oracles
Computes and collects fees, with two independent fee profiles (`AuctionFee`, `OrderFee`).

- **Base fee** (charged to list) and **final fee** (charged on a completed sale), each configurable as a fixed USD amount, a percentage, or both.
- **Oracle pricing**: Chainlink `AggregatorV3Interface` feeds for native/ERC‑20 tokens, and a DIA oracle (`IDIAOracleV2`) for the `LKR` token. Fees are expressed in USD (1 USD = `1e18`) and converted to the chosen payment token at current price.
- **Price caps** and **final-fee caps** per fee profile.
- **Discounts**: per-token discount amounts, including a dedicated LKR token discount.
- Payment token management: `addPaymentToken`, `removePaymentToken`, `removeAllPaymentTokens`, `setNativeTokenPriceFeed`, `setLKRToken`.
- `payNow` records prepaid base fees; `disposeFeeRecord` (SwaprGL-only) consumes them on listing.

### Support contracts & interfaces

- `common/BaseGovernanceWithUserUpgradable.sol` — UUPS + AccessControl base with `GOVERNANCE_ROLE` / `UPGRADE_MANAGER_ROLE` and a two-step upgrade proposal flow.
- `utils/ListingHelper.sol` — `Auction`, `Order`, `Bid`, `PayNow` structs plus all signature verification, encoding/decoding, and listing/bid validation logic.
- `interfaces/` — `ILock` (external Lokr ERC‑721 lock), `ISplitManager`, `ISwaprWallet`, `ISwaprFee`, `IDIAOracleV2`, `IERC20Burnable`.
- `TestSwaprToken.sol` — an upgradeable ERC‑20 (`TST`) used only for testing.

---

## Key Concepts

- **Two-layer signatures.** Most payloads are `abi.encode(innerData, signature)`. SwaprGL verifies the marketplace signature on the outer wrapper and the seller/bidder signature on the inner data before acting.
- **Deposit types.** `1` = Auction, `2` = Order, `3` = deposit-for-future-listing.
- **Splitting / fractional ownership.** Orders can be sold in parts; `EXP = 1e18` represents 100%. On a partial buy, the NFT is split via the lock's `SplitManager`, the buyer receives their fraction, and the seller's remaining fraction is re-locked.
- **EOA vs in-wallet settlement.** `toEOA` decides whether proceeds go directly to an external account or are credited inside `SwaprWallet` for reuse.
- **Time offset.** Late bids extend an auction by `timeOffset` to prevent last-second sniping.

---

## Repository Layout

```
.
├── contracts/
│   ├── SwaprGL.sol              # Marketplace logic
│   ├── SwaprWallet.sol          # Asset & fund custody
│   ├── SwaprFee.sol             # Fee engine + oracle pricing
│   ├── TestSwaprToken.sol       # Test ERC-20
│   ├── common/                  # Governance/UUPS base
│   ├── utils/ListingHelper.sol  # Structs + signature/validation logic
│   └── interfaces/              # ILock, ISplitManager, ISwaprWallet, ISwaprFee, ...
├── scripts/
│   ├── deploy.js                # Deploys + initializes + verifies all proxies
│   └── createListing.js         # End-to-end "create an order listing" example
├── test/
│   ├── swapr/                   # deposit / claim / withdraw flows
│   ├── marketplace/             # auctions, orders, fee tests
│   └── wallet/                  # deposit tests
├── hardhat.config.js
├── deployed_instances.json      # Last deployed proxy addresses
├── .env.example
└── package.json
```

---

## Prerequisites

- **Node.js** ≥ 18 (tested with v18.20.x)
- **Yarn** 1.x (a `yarn.lock` is committed) — npm also works
- An EVM RPC endpoint (the project is configured for Alchemy on Ethereum/Goerli/Mumbai and public BSC endpoints)
- A funded deployer key for any non-local network

> **Note on the Solidity version:** the contracts declare `pragma solidity 0.8.19`, while `hardhat.config.js` currently pins the compiler to `0.8.9`. Bump the `solidity.compilers[].version` in `hardhat.config.js` to `0.8.19` (or add it to the list) before compiling.

---

## Installation

```bash
# clone, then from the project root:
yarn install
# or
npm install
```

---

## Configuration

Copy the example env file and fill in your own values:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `MNEMONIC` | Wallet mnemonic (used for `ethereum` / `binance` mainnet networks) |
| `PRIVATE_KEY` | Deployer private key (used for testnets) |
| `ALCHEMY_KEY_ETHEREUM` / `ALCHEMY_KEY_GOERLI` / `ALCHEMY_KEY_MATIC` / `ALCHEMY_KEY_POLYGON_MAINNET` | Alchemy RPC keys |
| `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `POLYGONSCAN_API_KEY` | Block-explorer keys for contract verification |
| `COINMARKETCAP_API_KEY` | Used by the gas reporter for USD pricing |
| `REPORT_GAS` | `true` to enable the gas reporter during tests |

`.env` is git-ignored. **Never commit real keys.**

The default Hardhat network forks Polygon Mumbai (see `hardhat.config.js`) so tests can run against realistic on-chain state.

---

## Building & Testing

```bash
# Compile contracts
npm run compile          # alias for: npx hardhat compile

# Run the full test suite (Mocha/Chai via Hardhat)
npm test                 # alias for: hardhat test

# Run tests with a gas report
REPORT_GAS=true npm test

# Coverage
npx hardhat coverage

# Format Solidity / tests / scripts with Prettier
npm run prettier-contracts
npm run prettier-tests
npm run prettier-scripts

# Spin up a local node
npx hardhat node

# Explore available tasks
npx hardhat help
```

Tests are organized by area under `test/` (`swapr/`, `marketplace/`, `wallet/`) and use ABI fixtures (`lock.abi.json`, `splitManager.abi.json`) plus helpers in `test/utils.js`.

---

## Deployment

`scripts/deploy.js` deploys **all three core contracts as UUPS proxies**, initializes them with the correct cross-references, verifies the implementations on the block explorer, and writes the resulting proxy addresses to `deployed_instances.json`.

Before deploying, review the two hard-coded addresses near the top of `scripts/deploy.js`:

```js
const governor      = "0x...";  // governance role holder
const marketplaceGL = "0x...";  // trusted marketplace EOA used for signature checks
```

Then run one of the preconfigured network targets:

```bash
npm run deploy:goerli       # Ethereum Goerli
npm run deploy:sepolia      # Sepolia (see config note below)
npm run deploy:mumbai       # Polygon Mumbai
npm run deploy:testbinance  # BSC Testnet (chainId 97)

# or directly against any configured network:
npx hardhat run scripts/deploy.js --network <network>
```

Initialization wiring performed by the script:

- `SwaprGL.initialize(SwaprWallet, marketplaceGL, SwaprFee)`
- `SwaprWallet.initialize(SwaprGL)` — grants `SWAPRGL_ROLE` to SwaprGL
- `SwaprFee.initialize(SwaprGL)` — grants `SWAPRGL_ROLE` to SwaprGL and sets the deployer as fee receiver

> Configured networks live in `hardhat.config.js`. The `sepolia` entry currently points at a Goerli RPC URL — update it to a real Sepolia endpoint before using `deploy:sepolia`.

---

## Creating a Listing (example script)

`scripts/createListing.js` is a runnable, end-to-end example of building a **fixed-price Order** listing against already-deployed contracts. It:

1. Builds the order payload and signs it with the seller key.
2. Wraps it with the marketplace signature.
3. Pays the base fee in an ERC‑20 (LINK in the example) via `SwaprFee.payNow`.
4. Approves the lock NFT to `SwaprWallet`.
5. Calls `SwaprGL.createListing(...)`.

Update the hard-coded contract/token/lock addresses inside the script to match your deployment, then:

```bash
npx hardhat run scripts/createListing.js --network <network>
```

Use it as a template for wiring a front-end or backend that produces the signed payloads Swapr expects.

---

## Security Notes

- **Upgradeable proxies.** All core contracts use OpenZeppelin UUPS. Upgrades are gated by `GOVERNANCE_ROLE` (and an `UPGRADE_MANAGER_ROLE` two-step proposal flow). Storage layout must be preserved across upgrades — always append new state variables.
- **Trusted marketplace key.** Security depends on the marketplace EOA's signing key. Compromise of that key allows forging listing approvals — protect and rotate it appropriately.
- **Oracle dependency.** Fee pricing relies on Chainlink and DIA oracles. Stale or manipulated feeds affect fee calculation; the code checks for non-zero/complete rounds but does not enforce freshness windows.
- **Audit status.** These contracts are marked `UNLICENSED` at the source level and are not represented here as audited. Review and audit before any production use.
- **Secrets hygiene:** `.env.example` ships with a placeholder `COINMARKETCAP_API_KEY` value committed to the repo — treat it as compromised, rotate it, and keep all real keys in your local `.env` only.

---

## License

The repository `LICENSE` file is **BSD 2-Clause** (Copyright © 2022, Lokr). Note that the Solidity source files carry `SPDX-License-Identifier: UNLICENSED`/`Unlicensed` headers and `package.json` declares `ISC`. Clarify the intended license with the project owners before redistribution.
