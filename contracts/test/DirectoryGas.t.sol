// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";
import {EventDirectory} from "../src/EventDirectory.sol";

/// Monad charges the gas limit, not the amount used, so the frontend cannot pad — it has to pin a
/// limit close to the real cost. `describe` writes variable-length strings, so that cost is a
/// function of input size. These print two points to fit a line through.
contract DirectoryGasTest is Test {
    AttendanceEscrow escrow;
    EventDirectory dir;
    address organizer = makeAddr("organizer");

    function setUp() public {
        escrow = new AttendanceEscrow();
        dir = new EventDirectory(address(escrow));
        vm.prank(organizer);
        escrow.createEvent(
            makeAddr("beacon"),
            1 ether,
            10,
            3,
            2,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );
    }

    function test_measure() public {
        uint256[3] memory sizes = [uint256(32), 300, 1020];
        for (uint256 i; i < sizes.length; ++i) {
            // A fresh event each time: rewriting a slot is cheaper than filling an empty one, and
            // the frontend has to budget for the expensive case.
            vm.prank(organizer);
            uint256 id = escrow.createEvent(
                makeAddr("beacon"),
                1 ether,
                10,
                3,
                2,
                uint64(block.timestamp + 1 hours),
                uint64(block.timestamp + 1 hours),
                uint64(block.timestamp + 2 hours)
            );

            uint256 titleLen = sizes[i] > 120 ? 120 : sizes[i];
            uint256 rest = sizes[i] - titleLen;
            uint256 blurbLen = rest > 600 ? 600 : rest;
            uint256 urlLen = rest - blurbLen;

            string memory t = _repeat(titleLen);
            string memory b = _repeat(blurbLen);
            string memory u = _repeat(urlLen);

            vm.prank(organizer);
            uint256 before = gasleft();
            dir.describe(id, t, b, u, "");
            uint256 used = before - gasleft();

            console.log("bytes", sizes[i], "gas", used);
        }
    }

    function _repeat(uint256 n) private pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = "a";
        return string(b);
    }
}
