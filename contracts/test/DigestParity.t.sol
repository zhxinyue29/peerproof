// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttendanceEscrow} from "../src/AttendanceEscrow.sol";

/// @notice Pins the exact digests the frontend must reproduce.
///
/// The app signs rotating codes offchain with viem; the contract verifies them onchain. If the
/// two ABI encodings ever drift, every attestation at the venue reverts with BadCode and the
/// failure is unreproducible on a laptop. The expected values below were computed independently
/// by `viem` — see web/lib/codes.ts. Changing either side without the other breaks this test,
/// which is the point.
contract DigestParityTest is Test {
    AttendanceEscrow esc;

    address constant ESCROW = 0x1111111111111111111111111111111111111111;
    address constant SUBJECT = 0x2222222222222222222222222222222222222222;
    uint256 constant EVENT_ID = 42;
    uint64 constant EPOCH_N = 1000;
    uint64 constant BEACON_EPOCH_N = 500;

    function setUp() public {
        // address(this) is part of both digests, so the contract has to live at the address the
        // reference values were computed against.
        deployCodeTo("AttendanceEscrow.sol:AttendanceEscrow", "", ESCROW);
        esc = AttendanceEscrow(ESCROW);
    }

    function test_codeDigestMatchesViem() public view {
        assertEq(
            esc.codeDigest(EVENT_ID, SUBJECT, EPOCH_N),
            0x6ae93c556cad35fc35a3fb5dedb9c9785456dc0f07055cb0730962f4db1ca447,
            "codeDigest drifted from web/lib/codes.ts"
        );
    }

    function test_beaconDigestMatchesViem() public view {
        assertEq(
            esc.beaconDigest(EVENT_ID, BEACON_EPOCH_N),
            0x170b986733ff93a807ad6079485a7e78abd5348daf96fdd0f5dbb47ed541d901,
            "beaconDigest drifted from web/lib/codes.ts"
        );
    }
}
