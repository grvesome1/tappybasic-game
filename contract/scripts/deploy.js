import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";

async function main() {
  const signers = await hre.network.provider.request({
    method: "eth_accounts"
  });
  
  const ethers = hre.ethers;
  const [deployerAddress] = signers;
  const deployer = await ethers.getSigner(deployerAddress);

  console.log("Deploying TappyCredits with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", balance.toString());

  // Deploy TappyCredits (no constructor arguments)
  const TappyCredits = await hre.ethers.getContractFactory("TappyCredits");
  const contract = await TappyCredits.deploy();

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  
  console.log("\n✅ TappyCredits deployed to:", contractAddress);
  console.log("\n📋 Next steps:");
  console.log("1. Verify contract on Linea block explorer");
  console.log("2. Update CONTRACT_ADDRESS in public/index.html to:", contractAddress);
  console.log("3. Test credit purchase on Linea Sepolia");
  
  // Display contract info
  const creditPrice = await contract.CREDIT_PRICE_WEI();
  const owner = await contract.owner();
  
  console.log("\n📊 Contract Info:");
  console.log("   Credit Price:", creditPrice.toString(), "wei (0.000005 ETH)");
  console.log("   Owner:", owner);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
