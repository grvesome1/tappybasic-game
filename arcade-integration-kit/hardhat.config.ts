// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { configVariable, defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

export default defineConfig({
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    lineaSepolia: {
      type: "http",
      url: configVariable("LINEA_SEPOLIA_RPC_URL"),
      chainId: 59141,
      accounts
    },
    linea: {
      type: "http",
      url: configVariable("LINEA_RPC_URL"),
      chainId: 59144,
      accounts
    }
  },
  verify: {
    etherscan: {
      apiKey: configVariable("LINEASCAN_API_KEY")
    }
  }
});
