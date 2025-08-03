<div align="center">
  <img height="120x" src="https://uploads-ssl.webflow.com/611580035ad59b20437eb024/616f97a42f5637c4517d0193_Logo%20(1)%20(1).png" />

  <h1 style="margin-top:20px;">Permissionless Attention Perps</h1>
  <h3>Built on Drift Protocol v2</h3>

  <p>
    <a href="https://drift-labs.github.io/v2-teacher/"><img alt="Docs" src="https://img.shields.io/badge/docs-tutorials-blueviolet" /></a>
    <a href="https://discord.com/channels/849494028176588802/878700556904980500"><img alt="Discord Chat" src="https://img.shields.io/discord/889577356681945098?color=blueviolet" /></a>
    <a href="https://opensource.org/licenses/Apache-2.0"><img alt="License" src="https://img.shields.io/github/license/project-serum/anchor?color=blueviolet" /></a>
  </p>
</div>

# Permissionless Attention Perps

This repository repurposes **Drift Protocol v2's smart contracts** to create **permissionless attention perps**. We focus purely on the **prelaunch oracle-based process** and **commoditize the launch process** for speculative markets.

## 🎯 Project Overview

We have taken the robust Drift v2 smart contracts and adapted them to enable:

- **Permissionless Attention Perps**: Trade on speculative events, personalities, or trending topics
- **Prelaunch Oracle System**: Launch markets before spot prices exist using custom oracle feeds
- **Commoditized Launch Process**: Streamlined market creation for any unlisted perpetuals
- **Prediction Markets**: Enable betting on outcomes where traditional price oracles don't exist
- **Zero Contract Changes**: We use the original Drift v2 contracts with only parameter adjustments

## 🚀 Key Features

- **No Spot Price Required**: Perfect for markets where traditional price feeds don't exist
- **Rapid Market Deployment**: Streamlined process for launching new perp markets
- **Custom Oracle Integration**: Support for prelaunch and custom price feeds
- **Full AMM Liquidity**: Leverages Drift's sophisticated AMM for deep liquidity
- **Parameter-Only Modifications**: All customizations done through configuration, not code changes

## 📁 Market Creation Scripts

Our core innovation is demonstrated in the market creation and management scripts:

- **[create-and-fix-market.js](./create-and-fix-market.js)**: Main script for creating and configuring attention perp markets with custom AMM parameters
- **[create-def-market.js](./create-def-market.js)**: Default market creation script for standard configurations

These scripts showcase our **commoditized launch process** and demonstrate how we've streamlined market creation while maintaining the full power of Drift's infrastructure.

## 🔧 Use Cases

While designed for **attention perps**, this system is applicable to:
- **Unlisted Perpetuals**: Any asset without existing spot markets
- **Prediction Markets**: Political events, sports outcomes, social media metrics
- **Speculative Trading**: Trending topics, memes, cultural phenomena
- **Custom Derivatives**: Any market where you need to bootstrap liquidity before price discovery

---

*Built on the foundation of Drift Protocol v2's open source smart contracts*

Integrating Drift? [Go here](./sdk/README.md)

# SDK Guide

SDK docs can be found [here](./sdk/README.md)

# Example Bot Implementations

Example bots (makers, liquidators, fillers, etc) can be found [here](https://github.com/drift-labs/keeper-bots-v2)

# Building Locally

Note: If you are running the build on an Apple computer with an M1 chip, please set the default rust toolchain to `stable-x86_64-apple-darwin`

```bash
rustup default stable-x86_64-apple-darwin
```

## Compiling Programs

```bash
# build v2
anchor build
# install packages
yarn
# build sdk
cd sdk/ && yarn && yarn build && cd ..
```

## Running Rust Test

```bash
cargo test
```

## Running Javascript Tests

```bash
bash test-scripts/run-anchor-tests.sh
```

# Bug Bounty

Information about the Bug Bounty can be found [here](./bug-bounty/README.md)
