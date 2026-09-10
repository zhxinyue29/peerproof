// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettleReceiver} from "../src/SettleReceiver.sol";

/// @notice Deploys SettleReceiver, the adapter a Chainlink CRE workflow settles through.
///
/// Two addresses go in, both required:
///
///   FORWARDER  the KeystoneForwarder allowed to deliver reports. Simulation and production use
///              *different* forwarders and the receiver checks its caller, so this decides which
///              one the deployment answers to. Monad testnet:
///                simulation  0xB9F79d863261869B234c481D1f9A7af84AeAd192
///                production  0xF8344CFd5c43616a4366C34E3EEE75af79a74482
///              Confirm against `cre workflow supported-chains --output json` for your tenant
///              rather than trusting a table.
///   ESCROW     the AttendanceEscrow whose events get settled.
///
/// Monad charges gas on the gas *limit*, not gas used, so the limit is pinned rather than estimated.
/// 1,357 bytes of bytecode; 400,000 covers deployment with room to spare.
///
///   FORWARDER=0xB9F7... ESCROW=0x289a... \
///     forge script script/DeployReceiver.s.sol:DeployReceiver --account monad-deployer \
///       --rpc-url monad --broadcast --gas-limit 400000
contract DeployReceiver is Script {
    function run() external returns (SettleReceiver recv) {
        address forwarder = vm.envAddress("FORWARDER");
        address escrow = vm.envAddress("ESCROW");

        vm.startBroadcast();
        recv = new SettleReceiver(forwarder, escrow);
        vm.stopBroadcast();

        console.log("SettleReceiver:", address(recv));
        console.log("  forwarder:   ", forwarder);
        console.log("  escrow:      ", escrow);
        console.log("chainId:", block.chainid);
    }
}
