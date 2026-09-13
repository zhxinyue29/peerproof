// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventDirectory} from "../src/EventDirectory.sol";

/// @notice Deploys EventDirectory against an already-deployed escrow.
///
/// Separate from Deploy.s.sol because the escrow is not redeployed: it is live, source-verified,
/// and holds real deposits. Descriptions were added as a second contract precisely so that the one
/// holding money never has to change.
///
/// Monad charges gas on the gas *limit*, not gas used, so the limit is pinned rather than
/// estimated. Measured against the live testnet by simulating this script: 1,196,705 — most of it
/// the 200-gas-per-byte code deposit for 4,107 bytes. 1,300,000 leaves ~9%.
///
///   ESCROW=0x289a7ce11a3c3e754f346d5f34495fd2d76ad9c1 \
///   forge script script/DeployDirectory.s.sol:DeployDirectory --account monad-deployer \
///     --rpc-url monad --broadcast --gas-limit 1300000
contract DeployDirectory is Script {
    function run() external returns (EventDirectory dir) {
        address escrow = vm.envAddress("ESCROW");

        vm.startBroadcast();
        dir = new EventDirectory(escrow);
        vm.stopBroadcast();

        console.log("EventDirectory:", address(dir));
        console.log("escrow:", escrow);
        console.log("chainId:", block.chainid);
    }
}
