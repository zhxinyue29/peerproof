// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";

/// @notice Deploys AttendanceEscrow.
///
/// Monad charges gas on the gas *limit*, not gas used, so the limit is pinned explicitly rather
/// than left to estimation-plus-padding.
///
/// Measured at 2,370,395 gas; 2,800,000 is that plus headroom, because a deployment that runs out
/// of gas is billed the limit as well and then has to be paid for twice.
///
///   forge script script/Deploy.s.sol:Deploy --account monad-deployer \
///     --rpc-url monad_testnet --broadcast --gas-limit 2800000
///
/// `monad` instead of `monad_testnet` for mainnet.
contract Deploy is Script {
    function run() external returns (AttendanceEscrow esc) {
        vm.startBroadcast();
        esc = new AttendanceEscrow();
        vm.stopBroadcast();

        console.log("AttendanceEscrow:", address(esc));
        console.log("chainId:", block.chainid);
    }
}
