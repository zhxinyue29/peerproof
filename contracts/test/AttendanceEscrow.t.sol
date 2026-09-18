// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";

contract AttendanceEscrowTest is Test {
    AttendanceEscrow esc;

    address organizer = address(0xA11CE);

    uint256 constant BEACON_PK = 0xBEAC0;
    address beaconKey;

    uint96 constant DEPOSIT = 30 ether; // 30 MON ~= $0.78 at MON $0.026
    uint32 constant CAPACITY = 50;
    uint32 constant MIN_QUORUM = 10;
    uint8 constant K = 3;

    uint64 t0;
    uint64 registerDeadline;
    uint64 attestOpen;
    uint64 attestClose;

    uint256 eid;

    /// @dev attendee i uses private key i+1 for the wallet and i+1001 for the attest key
    function _wallet(uint256 i) internal pure returns (address addr) {
        addr = vm.addr(i + 1);
    }

    function _attestPk(uint256 i) internal pure returns (uint256) {
        return i + 1001;
    }

    function _attestKey(uint256 i) internal pure returns (address) {
        return vm.addr(_attestPk(i));
    }

    function setUp() public {
        vm.warp(1_000_000);
        t0 = uint64(block.timestamp);
        registerDeadline = t0 + 1 days;
        attestOpen = registerDeadline;
        attestClose = attestOpen + 10 minutes;
        beaconKey = vm.addr(BEACON_PK);

        esc = new AttendanceEscrow();

        vm.prank(organizer);
        eid = esc.createEvent(beaconKey, DEPOSIT, CAPACITY, MIN_QUORUM, K, registerDeadline, attestOpen, attestClose);
    }

    /* ------------------------------------------------------------------ */
    /*                              Helpers                              */
    /* ------------------------------------------------------------------ */

    function _register(uint256 i) internal {
        address addr = _wallet(i);
        vm.deal(addr, 100 ether);
        vm.prank(addr);
        esc.register{value: DEPOSIT}(eid, _attestKey(i));
    }

    function _registerMany(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            _register(i);
        }
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _beacon() internal view returns (uint64 bEpoch, bytes memory bSig) {
        bEpoch = esc.currentBeaconEpoch();
        bSig = _sign(BEACON_PK, esc.beaconDigest(eid, bEpoch));
    }

    function _checkIn(uint256 i) internal {
        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.prank(_wallet(i));
        esc.checkIn(eid, bEpoch, bSig);
    }

    /// @dev Arrival is its own act now, and every test below that attests is testing something
    ///      other than arrival, so walking through the door is done for them.
    function _ensureCheckedIn(uint256 i) internal {
        if (esc.checkedInAt(eid, _wallet(i)) == 0) _checkIn(i);
    }

    /// @dev prepare a peer code without submitting, so a test can wrap only the `attest` call in
    ///      `vm.expectRevert`
    function _prep(uint256 subjectIdx)
        internal
        view
        returns (address subject, uint64 epoch, bytes memory code)
    {
        subject = _wallet(subjectIdx);
        epoch = esc.currentEpoch();
        code = _sign(_attestPk(subjectIdx), esc.codeDigest(eid, subject, epoch));
    }

    /// @dev `attesterIdx` submits the code that `subjectIdx` is currently displaying
    function _attest(uint256 attesterIdx, uint256 subjectIdx) internal {
        _ensureCheckedIn(attesterIdx);
        (address subject, uint64 epoch, bytes memory code) = _prep(subjectIdx);
        vm.prank(_wallet(attesterIdx));
        esc.attest(eid, subject, epoch, code);
    }

    /// @dev Every unordered pair among the first `n` attendees attests once, alternating who
    ///      does the scanning. Direction matters: presence requires having scanned somebody, so
    ///      always making the higher index the subject would leave the last person unconfirmed —
    ///      which is exactly what happens in the app if a user only ever shows their own code.
    function _mutualAttest(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            for (uint256 j = i + 1; j < n; ++j) {
                if ((i + j) % 2 == 0) {
                    _attest(i, j);
                } else {
                    _attest(j, i);
                }
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*                            Happy path                              */
    /* ------------------------------------------------------------------ */

    function test_peerAttestation_settlesWithoutOrganizer() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        // 4 attendees show up and all attest each other: 6 scans, 3 credits each
        _mutualAttest(4);
        assertEq(esc.confirmedCount(eid), 4, "four confirmed by peers");

        vm.warp(attestClose + 1);
        esc.settle(eid);

        // 6 no-shows forfeit 180 MON, split four ways on top of each 30 MON deposit
        uint256 expected = DEPOSIT + (uint256(DEPOSIT) * 6) / 4;
        assertEq(expected, 75 ether);

        for (uint256 i; i < 4; ++i) {
            address a = _wallet(i);
            uint256 before = a.balance;
            vm.prank(a);
            esc.claim(eid);
            assertEq(a.balance - before, expected, "confirmed attendee payout");
        }

        assertEq(address(esc).balance, 0, "pool distributed exactly, nothing stranded");
    }

    function test_organizerCannotReceiveFunds() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4);
        vm.warp(attestClose + 1);
        esc.settle(eid);

        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.NotRegistered.selector);
        esc.claim(eid);
    }

    function test_noShowCannotClaim() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4);
        vm.warp(attestClose + 1);
        esc.settle(eid);

        vm.prank(_wallet(9));
        vm.expectRevert(AttendanceEscrow.NothingToClaim.selector);
        esc.claim(eid);
    }

    function test_doubleClaimBlocked() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4);
        vm.warp(attestClose + 1);
        esc.settle(eid);

        address a = _wallet(0);
        vm.prank(a);
        esc.claim(eid);
        vm.prank(a);
        vm.expectRevert(AttendanceEscrow.AlreadyClaimed.selector);
        esc.claim(eid);
    }

    /* ------------------------------------------------------------------ */
    /*                    Presence requires being there                  */
    /* ------------------------------------------------------------------ */

    /// @dev the core anti-relay property: an attendee who is vouched for k times but never
    ///      submits an attestation themselves never held a venue beacon, so they are not present
    function test_receivingKWithoutAttestingIsNotPresence() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        // three people on site all vouch for absentee #9
        _attest(0, 9);
        _attest(1, 9);
        _attest(2, 9);

        assertEq(esc.attestCount(eid, _wallet(9)), 3, "vouched for k times");
        assertEq(esc.gaveCount(eid, _wallet(9)), 0, "but never vouched for anyone");
        assertFalse(esc.isConfirmed(eid, _wallet(9)), "so not present");
        assertEq(esc.confirmedCount(eid), 0);

        // the moment they scan someone themselves, they qualify
        _attest(9, 3);
        assertTrue(esc.isConfirmed(eid, _wallet(9)), "now present");
    }

    function test_badBeaconRejected() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        uint64 bEpoch = esc.currentBeaconEpoch();
        bytes memory forged = _sign(uint256(0xBAD), esc.beaconDigest(eid, bEpoch));

        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.BadBeacon.selector);
        esc.checkIn(eid, bEpoch, forged);
    }

    function test_staleBeaconRejected() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (uint64 bEpoch, bytes memory bSig) = _beacon();

        // three beacon epochs later the venue code is worthless
        vm.warp(block.timestamp + 3 * esc.BEACON_EPOCH());

        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.StaleBeacon.selector);
        esc.checkIn(eid, bEpoch, bSig);
    }

    function test_previousBeaconEpochStillAccepted() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.warp(block.timestamp + esc.BEACON_EPOCH());

        // one epoch of slack, so reading the display and getting the transaction mined are not
        // required to happen in the same instant
        vm.prank(_wallet(0));
        esc.checkIn(eid, bEpoch, bSig);
        assertGt(esc.checkedInAt(eid, _wallet(0)), 0);
    }

    /* ------------------------------------------------------------------ */
    /*                          Arrival vs vouching                       */
    /* ------------------------------------------------------------------ */

    /// The venue clock and the social clock are independent. Somebody who has checked in should
    /// be able to spend the rest of the evening meeting people — greeting a stranger, waiting for
    /// them to unlock their phone, finding the next one — without the venue display expiring
    /// underneath them. An earlier version tied both to the beacon, which in a real room meant a
    /// two-minute deadline on making a friend.
    function test_checkInLastsTheWholeWindow() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _checkIn(0);

        // check in at the door, scan somebody in the last second of the evening: every beacon
        // epoch in between expires unused, and none of them matters
        vm.warp(attestClose - 1);
        assertGt((attestClose - attestOpen) / esc.BEACON_EPOCH(), 10, "many beacon epochs elapsed");

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(_wallet(0));
        esc.attest(eid, subject, epoch, code);
        assertEq(esc.attestCount(eid, subject), 1, "arrival does not expire");
    }

    function test_attestRequiresCheckIn() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.NotCheckedIn.selector);
        esc.attest(eid, subject, epoch, code);
    }

    /// Being scanned is not arriving. A code can be shown from anywhere — a screenshot texted to
    /// the room — so receiving attestations must not silently make somebody present.
    function test_beingAttestedDoesNotCheckYouIn() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _attest(0, 1);

        assertGt(esc.checkedInAt(eid, _wallet(0)), 0, "the scanner arrived");
        assertEq(esc.checkedInAt(eid, _wallet(1)), 0, "the scanned party did not");
    }

    function test_cannotCheckInTwice() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _checkIn(0);

        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.AlreadyCheckedIn.selector);
        esc.checkIn(eid, bEpoch, bSig);
    }

    function test_unregisteredCannotCheckIn() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.prank(address(0xBEEF));
        vm.expectRevert(AttendanceEscrow.NotRegistered.selector);
        esc.checkIn(eid, bEpoch, bSig);
    }

    function test_checkInBeforeWindowRejected() public {
        _registerMany(10);
        vm.warp(attestOpen - 10);

        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.WindowOpen.selector);
        esc.checkIn(eid, bEpoch, bSig);
    }

    function test_checkInAfterWindowRejected() public {
        _registerMany(10);
        vm.warp(attestClose + 1);

        (uint64 bEpoch, bytes memory bSig) = _beacon();
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.WindowClosed.selector);
        esc.checkIn(eid, bEpoch, bSig);
    }

    function test_beaconKeyLockedOnceWindowOpens() public {
        vm.warp(attestOpen);
        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.WindowClosed.selector);
        esc.setBeaconKey(eid, address(0xFEED));
    }

    function test_beaconKeyReplaceableBeforeWindow() public {
        address newKey = vm.addr(0xF00D5);
        vm.prank(organizer);
        esc.setBeaconKey(eid, newKey);

        _registerMany(10);
        vm.warp(attestOpen + 1);

        // the old beacon key no longer works
        (uint64 bEpoch, bytes memory oldSig) = _beacon();
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.BadBeacon.selector);
        esc.checkIn(eid, bEpoch, oldSig);

        // the new one does
        bytes memory newSig = _sign(0xF00D5, esc.beaconDigest(eid, bEpoch));
        vm.prank(_wallet(0));
        esc.checkIn(eid, bEpoch, newSig);
        assertGt(esc.checkedInAt(eid, _wallet(0)), 0);
    }

    function test_onlyOrganizerSetsBeaconKey() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(AttendanceEscrow.NotOrganizer.selector);
        esc.setBeaconKey(eid, address(0xFEED));
    }

    /* ------------------------------------------------------------------ */
    /*                          Anti-farming                             */
    /* ------------------------------------------------------------------ */

    function test_pairCanOnlyAttestOnce() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _attest(0, 1);

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.PairAlreadyUsed.selector);
        esc.attest(eid, subject, epoch, code);
    }

    function test_reversedPairAlsoBlocked() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _attest(0, 1);

        // now 1 tries to attest 0 — the same unordered pair
        _ensureCheckedIn(1);
        (address subject, uint64 epoch, bytes memory code) = _prep(0);
        vm.prank(_wallet(1));
        vm.expectRevert(AttendanceEscrow.PairAlreadyUsed.selector);
        esc.attest(eid, subject, epoch, code);
    }

    function test_selfAttestationBlocked() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (address subject, uint64 epoch, bytes memory code) = _prep(0);
        vm.prank(subject);
        vm.expectRevert(AttendanceEscrow.SelfAttestation.selector);
        esc.attest(eid, subject, epoch, code);
    }

    function test_staleCodeRejected() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        _ensureCheckedIn(0);
        (address subject, uint64 epoch, bytes memory code) = _prep(1);

        // past the acceptance window the screenshot is worthless
        vm.warp(block.timestamp + esc.CODE_EPOCHS() * esc.EPOCH());

        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.StaleCode.selector);
        esc.attest(eid, subject, epoch, code);
    }

    /// The window exists for the seconds a person spends reading a wallet dialog. A vouch that
    /// simulates cleanly and then reverts *after* the user has confirmed it is the worst shape of
    /// failure available: it has already been paid for.
    function test_codeStillGoodWhileAWalletDialogIsOpen() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _ensureCheckedIn(0);
        (address subject, uint64 epoch, bytes memory code) = _prep(1);

        // Read the code, then take 45 seconds over the confirmation.
        vm.warp(block.timestamp + (esc.CODE_EPOCHS() - 1) * esc.EPOCH());

        vm.prank(_wallet(0));
        esc.attest(eid, subject, epoch, code);
        assertEq(esc.attestCount(eid, subject), 1, "a slow confirmation still counts");
    }

    /// A code for an epoch that has not arrived yet is not a slow submission, it is a forgery
    /// attempt or a clock that cannot be trusted. Either way it is not evidence of presence.
    function test_futureCodeRejected() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _ensureCheckedIn(0);

        address subject = _wallet(1);
        uint64 future = esc.currentEpoch() + 1;
        bytes memory code = _sign(_attestPk(1), esc.codeDigest(eid, subject, future));

        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.StaleCode.selector);
        esc.attest(eid, subject, future, code);
    }

    function test_previousCodeEpochStillAccepted() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        _ensureCheckedIn(0);
        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.warp(block.timestamp + esc.EPOCH());

        vm.prank(_wallet(0));
        esc.attest(eid, subject, epoch, code);
        assertEq(esc.attestCount(eid, subject), 1);
    }

    function test_forgedCodeRejected() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        _ensureCheckedIn(0);
        address subject = _wallet(1);
        uint64 epoch = esc.currentEpoch();
        bytes memory forged = _sign(uint256(9999), esc.codeDigest(eid, subject, epoch));

        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.BadCode.selector);
        esc.attest(eid, subject, epoch, forged);
    }

    function test_unregisteredCannotAttest() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(address(0xBEEF));
        vm.expectRevert(AttendanceEscrow.NotRegistered.selector);
        esc.attest(eid, subject, epoch, code);
    }

    function test_attestBeforeWindowRejected() public {
        _registerMany(10);
        vm.warp(attestOpen - 10);

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.WindowOpen.selector);
        esc.attest(eid, subject, epoch, code);
    }

    function test_attestAfterWindowRejected() public {
        _registerMany(10);
        vm.warp(attestClose + 1);

        (address subject, uint64 epoch, bytes memory code) = _prep(1);
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.WindowClosed.selector);
        esc.attest(eid, subject, epoch, code);
    }

    /* ------------------------------------------------------------------ */
    /*                       Organizer fallback                          */
    /* ------------------------------------------------------------------ */

    function test_fallbackLockedWhenPeersReachedQuorum() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4); // peerConfirmed = 4 > k = 3
        vm.warp(attestClose + 1);

        address[] memory list = new address[](1);
        list[0] = _wallet(9);

        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.FallbackLocked.selector);
        esc.organizerCheckIn(eid, list);
    }

    function test_fallbackUnlocksForTinyRoom() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        // only two people show up; one scan is all they can manage
        _attest(0, 1);
        assertEq(esc.confirmedCount(eid), 0, "two people cannot reach k=3 alone");

        vm.warp(attestClose + 1);

        address[] memory list = new address[](2);
        list[0] = _wallet(0);
        list[1] = _wallet(1);

        vm.prank(organizer);
        esc.organizerCheckIn(eid, list);
        assertEq(esc.confirmedCount(eid), 2);

        vm.warp(attestClose + esc.FALLBACK_WINDOW() + 1);
        esc.settle(eid);

        // 8 no-shows forfeit 240 MON, split two ways
        uint256 expected = DEPOSIT + (uint256(DEPOSIT) * 8) / 2;
        assertEq(expected, 150 ether);

        address a = _wallet(0);
        uint256 before = a.balance;
        vm.prank(a);
        esc.claim(eid);
        assertEq(a.balance - before, expected, "lone attendees are compensated, not merely refunded");
    }

    /// @dev The degenerate case: exactly one person turns up. They cannot attest anyone, so peers
    ///      can establish nothing — but they must not be the one who loses. The fallback confirms
    ///      them and they take the entire forfeited pool.
    function test_soleAttendeeTakesWholePool() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);

        // nobody to scan, so no peer attestation is possible at all
        assertEq(esc.confirmedCount(eid), 0);

        vm.warp(attestClose + 1);

        address[] memory list = new address[](1);
        list[0] = _wallet(0);
        vm.prank(organizer);
        esc.organizerCheckIn(eid, list);

        vm.warp(attestClose + esc.FALLBACK_WINDOW() + 1);
        esc.settle(eid);

        // 9 no-shows forfeit 270 MON, all of it to the one person who came
        uint256 expected = DEPOSIT + uint256(DEPOSIT) * 9;
        assertEq(expected, 300 ether);

        address a = _wallet(0);
        uint256 before = a.balance;
        vm.prank(a);
        esc.claim(eid);
        assertEq(a.balance - before, expected, "sole attendee takes ten times their stake");
        assertEq(address(esc).balance, 0, "pool fully distributed");
    }

    /// @dev The residual trust in the degraded branch: if the organizer never checks anyone in,
    ///      the sole attendee gets their stake back but not the pool. Documented, not hidden.
    function test_soleAttendeeOnlyRefundedIfOrganizerNeverActs() public {
        _registerMany(10);
        vm.warp(attestClose + esc.FALLBACK_WINDOW() + 1);

        esc.settle(eid); // confirmed == 0, so nobody is penalised
        assertEq(uint8(esc.statusOf(eid)), uint8(AttendanceEscrow.Status.Cancelled));

        address a = _wallet(0);
        uint256 before = a.balance;
        vm.prank(a);
        esc.claim(eid);
        assertEq(a.balance - before, DEPOSIT, "stake returned, pool not awarded");
    }

    function test_onlyOrganizerCanFallback() public {
        _registerMany(10);
        vm.warp(attestClose + 1);
        address[] memory list = new address[](1);
        list[0] = _wallet(0);

        vm.prank(address(0xDEAD));
        vm.expectRevert(AttendanceEscrow.NotOrganizer.selector);
        esc.organizerCheckIn(eid, list);
    }

    /* ------------------------------------------------------------------ */
    /*                        Quorum and refunds                         */
    /* ------------------------------------------------------------------ */

    function test_belowMinQuorumRefundsEveryone() public {
        _registerMany(3); // fewer than MIN_QUORUM = 10
        vm.warp(registerDeadline + 1);

        esc.cancelForQuorum(eid);

        for (uint256 i; i < 3; ++i) {
            address a = _wallet(i);
            uint256 before = a.balance;
            vm.prank(a);
            esc.claim(eid);
            assertEq(a.balance - before, DEPOSIT, "full refund");
        }
        assertEq(address(esc).balance, 0);
    }

    function test_cannotCancelOnceQuorumMet() public {
        _registerMany(10);
        vm.warp(registerDeadline + 1);
        vm.expectRevert(AttendanceEscrow.QuorumMet.selector);
        esc.cancelForQuorum(eid);
    }

    /// @dev regression: a griefer must not be able to settle the instant the window shuts and
    ///      strand the handful of people who actually showed up
    function test_settleBlockedUntilFallbackWindowElapses() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _attest(0, 1);
        vm.warp(attestClose + 1);

        vm.prank(address(0xF00D));
        vm.expectRevert(AttendanceEscrow.FallbackPending.selector);
        esc.settle(eid);

        address[] memory list = new address[](2);
        list[0] = _wallet(0);
        list[1] = _wallet(1);
        vm.prank(organizer);
        esc.organizerCheckIn(eid, list);
        assertEq(esc.confirmedCount(eid), 2);
    }

    function test_healthyRoomSettlesImmediately() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4); // fallback is locked, so no need to wait
        vm.warp(attestClose + 1);

        esc.settle(eid);
        assertEq(uint8(esc.statusOf(eid)), uint8(AttendanceEscrow.Status.Settled));
    }

    function test_nobodyConfirmedRefundsEveryone() public {
        _registerMany(10);
        vm.warp(attestClose + esc.FALLBACK_WINDOW() + 1);

        esc.settle(eid); // confirmed == 0

        for (uint256 i; i < 10; ++i) {
            address a = _wallet(i);
            uint256 before = a.balance;
            vm.prank(a);
            esc.claim(eid);
            assertEq(a.balance - before, DEPOSIT, "no verdict, so no penalty");
        }
        assertEq(address(esc).balance, 0);
    }

    function test_settleRequiresWindowClosed() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        vm.expectRevert(AttendanceEscrow.WindowOpen.selector);
        esc.settle(eid);
    }

    function test_anyoneCanSettle() public {
        _registerMany(10);
        vm.warp(attestOpen + 1);
        _mutualAttest(4);
        vm.warp(attestClose + 1);

        // a scheduled job, not a privileged human, closes this out
        vm.prank(address(0xF00D));
        esc.settle(eid);
        assertEq(uint8(esc.statusOf(eid)), uint8(AttendanceEscrow.Status.Settled));
    }

    /* ------------------------------------------------------------------ */
    /*                            Parameters                             */
    /* ------------------------------------------------------------------ */

    function test_minQuorumMustExceedK() public {
        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.BadParams.selector);
        esc.createEvent(beaconKey, DEPOSIT, CAPACITY, K, K, registerDeadline, attestOpen, attestClose);
    }

    function test_beaconKeyRequiredAtCreation() public {
        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.BadParams.selector);
        esc.createEvent(address(0), DEPOSIT, CAPACITY, MIN_QUORUM, K, registerDeadline, attestOpen, attestClose);
    }

    function test_wrongDepositRejected() public {
        address a = _wallet(0);
        vm.deal(a, 100 ether);
        vm.prank(a);
        vm.expectRevert(AttendanceEscrow.BadParams.selector);
        esc.register{value: DEPOSIT - 1}(eid, _attestKey(0));
    }

    function test_cannotRegisterTwice() public {
        _register(0);
        vm.prank(_wallet(0));
        vm.expectRevert(AttendanceEscrow.AlreadyRegistered.selector);
        esc.register{value: DEPOSIT}(eid, _attestKey(0));
    }


    /* ------------------------------------------------------------------ */
    /*                              Walk-ins                              */
    /* ------------------------------------------------------------------ */

    /// An organizer may let registration run into the check-in window. The people a room actually
    /// attracts on the night are the ones most worth keeping, and nothing downstream cares whether
    /// the two windows were sequential.
    function test_registrationMayOverlapCheckIn() public {
        vm.prank(organizer);
        uint256 id = esc.createEvent(
            beaconKey, DEPOSIT, CAPACITY, MIN_QUORUM, K, t0 + 2 hours, t0 + 1 hours, t0 + 3 hours
        );
        assertGt(id, 0);
    }

    /// Registration outliving check-in would let somebody pay a deposit they can never reclaim —
    /// nobody can vouch for them once the window has shut.
    function test_registrationMayNotOutlastCheckIn() public {
        vm.prank(organizer);
        vm.expectRevert(AttendanceEscrow.BadParams.selector);
        esc.createEvent(
            beaconKey, DEPOSIT, CAPACITY, MIN_QUORUM, K, t0 + 4 hours, t0 + 1 hours, t0 + 3 hours
        );
    }

    /// The point of allowing it: somebody who joins after check-in started is confirmed on exactly
    /// the same terms as the people who booked a week ago.
    function test_walkInIsConfirmedLikeAnyoneElse() public {
        vm.prank(organizer);
        eid = esc.createEvent(beaconKey, DEPOSIT, CAPACITY, 2, 1, t0 + 2 hours, t0 + 1 hours, t0 + 3 hours);

        _register(0);
        _register(1);

        // Doors open. Registration is still running.
        vm.warp(t0 + 1 hours + 1);
        _register(2);
        assertTrue(esc.isRegistered(eid, _wallet(2)));

        _attest(0, 2);
        _attest(2, 1);

        assertTrue(esc.isConfirmed(eid, _wallet(2)));
    }
}
