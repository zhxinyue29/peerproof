// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";
import {SettleReceiver} from "../src/SettleReceiver.sol";
import {IERC165} from "../src/chainlink/IERC165.sol";
import {IReceiver} from "../src/chainlink/IReceiver.sol";

contract SettleReceiverTest is Test {
    AttendanceEscrow esc;
    SettleReceiver recv;

    address organizer = address(0xA11CE);
    address forwarder = address(0xF0F0);
    address stranger = address(0xBAD);

    uint256 constant BEACON_PK = 0xBEAC0;
    address beaconKey;

    uint96 constant DEPOSIT = 1 ether;
    uint32 constant CAPACITY = 6;
    /// The escrow requires minQuorum > k: a room needs k+1 people for peers to reach quorum at all.
    /// Three is therefore both the smallest quorum at k = 2 and the size of the room below.
    uint32 constant MIN_QUORUM = 3;
    uint8 constant K = 2;

    uint64 registerDeadline;
    uint64 attestOpen;
    uint64 attestClose;
    uint256 eid;

    event SettledByWorkflow(uint256 indexed eventId);
    event SettleDeclined(uint256 indexed eventId, bytes reason);

    function setUp() public {
        vm.warp(1_000_000);
        registerDeadline = uint64(block.timestamp + 1 days);
        attestOpen = registerDeadline;
        attestClose = attestOpen + 10 minutes;
        beaconKey = vm.addr(BEACON_PK);

        esc = new AttendanceEscrow();
        recv = new SettleReceiver(forwarder, address(esc));

        vm.prank(organizer);
        eid = esc.createEvent(
            beaconKey, DEPOSIT, CAPACITY, MIN_QUORUM, K, registerDeadline, attestOpen, attestClose
        );
    }

    /* ------------------------------------------------------------------ */
    /*  the interface the forwarder probes for                            */
    /* ------------------------------------------------------------------ */

    /// The forwarder will not deliver to a contract that fails this probe, and IReceiver is
    /// declared locally rather than imported to keep forge-std the only dependency. So the ids are
    /// pinned to the selectors Chainlink's own interface produces: if a future edit changes the
    /// signature, reports stop arriving silently and this is the only thing that would say so.
    function test_interfaceIdsMatchChainlink() public view {
        assertEq(type(IReceiver).interfaceId, bytes4(0x805f2132), "onReport(bytes,bytes)");
        assertEq(type(IERC165).interfaceId, bytes4(0x01ffc9a7), "ERC-165");
        assertTrue(recv.supportsInterface(0x805f2132));
        assertTrue(recv.supportsInterface(0x01ffc9a7));
        assertFalse(recv.supportsInterface(0xdeadbeef));
    }

    /* ------------------------------------------------------------------ */
    /*  access                                                            */
    /* ------------------------------------------------------------------ */

    function test_onlyForwarderMayDeliver() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(SettleReceiver.InvalidSender.selector, stranger, forwarder)
        );
        recv.onReport("", abi.encode(eid));
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(SettleReceiver.ZeroAddress.selector);
        new SettleReceiver(address(0), address(esc));

        vm.expectRevert(SettleReceiver.ZeroAddress.selector);
        new SettleReceiver(forwarder, address(0));
    }

    /// A short report would make abi.decode read past its end and settle whatever event id the
    /// adjacent calldata happened to spell.
    function test_rejectsMalformedReport() public {
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SettleReceiver.MalformedReport.selector, 4));
        recv.onReport("", hex"deadbeef");

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(SettleReceiver.MalformedReport.selector, 64));
        recv.onReport("", abi.encode(eid, eid));
    }

    /* ------------------------------------------------------------------ */
    /*  the point of the thing                                            */
    /* ------------------------------------------------------------------ */

    function test_settlesAfterTheWindowCloses() public {
        _fillRoom();
        vm.warp(attestClose + 1);

        vm.expectEmit(true, false, false, false, address(recv));
        emit SettledByWorkflow(eid);
        _deliver(eid);

        assertEq(uint8(esc.getEvent(eid).status), uint8(AttendanceEscrow.Status.Settled));
    }

    /// The workflow fires on a schedule, so most firings land before the window closes. Those must
    /// not revert: Chainlink retries a reverting onReport with a higher gas limit, so bubbling
    /// WindowOpen would turn every early tick into an escalating retry of a call that cannot yet
    /// succeed.
    function test_earlyReportIsDeclinedNotReverted() public {
        _fillRoom();

        vm.expectEmit(true, false, false, true, address(recv));
        emit SettleDeclined(eid, abi.encodeWithSelector(AttendanceEscrow.WindowOpen.selector));
        _deliver(eid);

        assertEq(uint8(esc.getEvent(eid).status), uint8(AttendanceEscrow.Status.Open));
    }

    /// And for the tick after a successful settlement, which is every tick once the event is over
    /// and the cron is still running.
    function test_repeatReportIsDeclinedNotReverted() public {
        _fillRoom();
        vm.warp(attestClose + 1);
        _deliver(eid);

        vm.expectEmit(true, false, false, true, address(recv));
        emit SettleDeclined(eid, abi.encodeWithSelector(AttendanceEscrow.WrongStatus.selector));
        _deliver(eid);
    }

    function test_unknownEventIdIsDeclinedNotReverted() public {
        vm.warp(attestClose + 1);
        // Must not revert. The reason lands in the event and therefore in the workflow log.
        _deliver(9_999);
    }

    /// The adapter reaches the verdict, never the money. Deposits still leave the escrow the only
    /// way they ever could: each attendee calling claim for themselves.
    function test_receiverNeverReceivesFunds() public {
        _fillRoom();
        vm.warp(attestClose + 1);
        _deliver(eid);
        assertEq(address(recv).balance, 0);
        assertEq(address(esc).balance, uint256(DEPOSIT) * 3);
    }

    /* ------------------------------------------------------------------ */
    /*  helpers                                                           */
    /* ------------------------------------------------------------------ */

    function _deliver(uint256 eventId) internal {
        vm.prank(forwarder);
        recv.onReport("", abi.encode(eventId));
    }

    function _wallet(uint256 i) internal pure returns (address) {
        return vm.addr(i + 1);
    }

    function _attestPk(uint256 i) internal pure returns (uint256) {
        return i + 1001;
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _attest(uint256 attesterIdx, uint256 subjectIdx) internal {
        if (esc.checkedInAt(eid, _wallet(attesterIdx)) == 0) {
            uint64 bEpoch = esc.currentBeaconEpoch();
            bytes memory bSig = _sign(BEACON_PK, esc.beaconDigest(eid, bEpoch));
            vm.prank(_wallet(attesterIdx));
            esc.checkIn(eid, bEpoch, bSig);
        }

        address subject = _wallet(subjectIdx);
        uint64 epoch = esc.currentEpoch();
        bytes memory code = _sign(_attestPk(subjectIdx), esc.codeDigest(eid, subject, epoch));

        vm.prank(_wallet(attesterIdx));
        esc.attest(eid, subject, epoch, code);
    }

    /// Three attendees, every pair scanning once, alternating who holds the phone. Three is the
    /// smallest room that settles at K = 2, because N mutual vouchers leave everyone with N - 1
    /// vouches. Alternating also gives each of them a scan of their own, which is what the escrow
    /// requires as proof they came through the door.
    function _fillRoom() internal {
        for (uint256 i; i < 3; ++i) {
            address w = _wallet(i);
            vm.deal(w, 10 ether);
            vm.prank(w);
            esc.register{value: DEPOSIT}(eid, vm.addr(_attestPk(i)));
        }

        vm.warp(attestOpen + 1);
        for (uint256 i; i < 3; ++i) {
            for (uint256 j = i + 1; j < 3; ++j) {
                if ((i + j) % 2 == 0) _attest(i, j);
                else _attest(j, i);
            }
        }
    }
}
