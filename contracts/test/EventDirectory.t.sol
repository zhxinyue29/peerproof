// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";
import {EventDirectory} from "../src/EventDirectory.sol";

/// The directory is only allowed to be wrong in ways that cost nothing. These check that the
/// organizer gate holds, that the bounds hold, and — the one that matters — that nothing here can
/// reach the escrow.
contract EventDirectoryTest is Test {
    AttendanceEscrow escrow;
    EventDirectory dir;

    address organizer = makeAddr("organizer");
    address stranger = makeAddr("stranger");
    address beacon = makeAddr("beacon");

    uint256 eventId;

    function setUp() public {
        escrow = new AttendanceEscrow();
        dir = new EventDirectory(address(escrow));

        vm.prank(organizer);
        eventId = escrow.createEvent(
            beacon,
            1 ether,
            10,
            3,
            2,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );
    }

    function test_organizerCanDescribe() public {
        vm.prank(organizer);
        dir.describe(eventId, "Reading group", "Thursdays, upstairs.", "https://example.com/rg", "", "");

        EventDirectory.Listing memory l = dir.listingOf(eventId);
        assertEq(l.title, "Reading group");
        assertEq(l.blurb, "Thursdays, upstairs.");
        assertEq(l.url, "https://example.com/rg");
        assertEq(l.updatedAt, uint64(block.timestamp));
    }

    function test_strangerCannotDescribe() public {
        vm.prank(stranger);
        vm.expectRevert(EventDirectory.NotOrganizer.selector);
        dir.describe(eventId, "Spam", "", "", "", "");
    }

    function test_unknownEventRejected() public {
        vm.prank(organizer);
        vm.expectRevert(EventDirectory.NoSuchEvent.selector);
        dir.describe(eventId + 1, "Nope", "", "", "", "");

        vm.prank(organizer);
        vm.expectRevert(EventDirectory.NoSuchEvent.selector);
        dir.describe(0, "Nope", "", "", "", "");
    }

    function test_rewritingReplaces() public {
        vm.startPrank(organizer);
        dir.describe(eventId, "First", "a", "", "", "");
        dir.describe(eventId, "Second", "b", "", "", "");
        vm.stopPrank();

        EventDirectory.Listing memory l = dir.listingOf(eventId);
        assertEq(l.title, "Second");
        assertEq(l.blurb, "b");
    }

    function test_boundsEnforced() public {
        string memory tooLong = _repeat("x", 121);
        vm.prank(organizer);
        vm.expectRevert(EventDirectory.TooLong.selector);
        dir.describe(eventId, tooLong, "", "", "", "");
    }

    function test_undescribedReadsEmpty() public view {
        EventDirectory.Listing memory l = dir.listingOf(eventId);
        assertEq(l.updatedAt, 0);
        assertEq(bytes(l.title).length, 0);
    }

    function test_rangeReadSkipsGaps() public {
        vm.prank(organizer);
        uint256 second = escrow.createEvent(
            beacon,
            1 ether,
            10,
            3,
            2,
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 2 hours)
        );

        vm.prank(organizer);
        dir.describe(second, "Only this one", "", "", "", "");

        EventDirectory.Listing[] memory ls = dir.listingsIn(1, escrow.nextEventId());
        assertEq(ls.length, 2);
        assertEq(bytes(ls[0].title).length, 0); // eventId 1, never described
        assertEq(ls[1].title, "Only this one");
    }

    /// The point of a separate contract: it holds no funds and can move none. Whatever anyone
    /// writes here, the escrow's balance is untouched.
    function test_directoryCannotTouchEscrowFunds() public {
        vm.deal(address(escrow), 5 ether);
        uint256 before = address(escrow).balance;

        vm.prank(organizer);
        dir.describe(eventId, _repeat("a", 120), _repeat("b", 600), _repeat("c", 300), "", "");

        assertEq(address(escrow).balance, before);
        assertEq(address(dir).balance, 0);
    }

    function _repeat(string memory ch, uint256 n) private pure returns (string memory out) {
        bytes memory b = new bytes(n);
        bytes1 c = bytes(ch)[0];
        for (uint256 i; i < n; ++i) b[i] = c;
        out = string(b);
    }
}
