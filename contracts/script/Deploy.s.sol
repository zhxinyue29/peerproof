// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";

/// @notice Deploys AttendanceEscrow.
///
/// Monad charges gas on the gas *limit*, not gas used, so the limit is pinned explicitly rather
/// than left to estimation-plus-padding.
///
///   forge script script/Deploy.s.sol:Deploy --account monad-deployer \
///     --rpc-url monad --broadcast --gas-limit 2800000
contract Deploy is Script {
    function run() external returns (AttendanceEscrow esc) {
        vm.startBroadcast();
        esc = new AttendanceEscrow();
        vm.stopBroadcast();

        console.log("AttendanceEscrow:", address(esc));
        console.log("chainId:", block.chainid);
    }
}
