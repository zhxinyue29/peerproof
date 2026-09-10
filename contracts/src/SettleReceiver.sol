// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AttendanceEscrow} from "./AttendanceEscrow.sol";
import {IERC165} from "./chainlink/IERC165.sol";
import {IReceiver} from "./chainlink/IReceiver.sol";

/// @title SettleReceiver
/// @notice Lets a Chainlink CRE workflow close an event on schedule instead of waiting for somebody
/// to remember.
///
/// CRE cannot call an arbitrary function on an arbitrary contract. A workflow produces a DON-signed
/// report, a node hands it to Chainlink's KeystoneForwarder, and the forwarder calls `onReport` on a
/// contract implementing IReceiver. This is that contract, and it does one thing with what arrives:
/// `settle(eventId)`.
///
/// It has no owner and no setters, which is not minimalism for its own sake. `settle` is
/// permissionless on the escrow — anyone with a wallet can already call it, and that is the property
/// that makes the escrow trustless. So there is no authority here worth guarding: the worst a
/// compromised forwarder could do is settle an event any stranger could already have settled. An
/// `Ownable` would add a privileged address to a system whose whole claim is that it has none, in
/// exchange for protecting nothing.
///
/// Deploy one per forwarder. CRE simulation and production use different forwarder addresses, so
/// those are two deployments rather than one mutable field.
contract SettleReceiver is IReceiver {
    /// @notice The KeystoneForwarder permitted to deliver reports.
    address public immutable FORWARDER;
    /// @notice The escrow whose events this receiver settles.
    AttendanceEscrow public immutable ESCROW;

    /// @notice A report arrived and `settle` went through.
    event SettledByWorkflow(uint256 indexed eventId);
    /// @notice A report arrived and `settle` declined it — too early, already settled, or quorum
    /// never reached. Emitted rather than reverted; see `onReport`.
    event SettleDeclined(uint256 indexed eventId, bytes reason);

    error InvalidSender(address sender, address expected);
    error ZeroAddress();
    error MalformedReport(uint256 length);

    constructor(address forwarder, address escrow) {
        if (forwarder == address(0) || escrow == address(0)) revert ZeroAddress();
        FORWARDER = forwarder;
        ESCROW = AttendanceEscrow(escrow);
    }

    /// @inheritdoc IReceiver
    /// @dev `metadata` carries the workflow id, name and owner, and is deliberately unread. With no
    /// authority to protect, checking which workflow sent a report would restrict who may trigger a
    /// public function rather than who may take a private action.
    ///
    /// A failing `settle` is caught, not bubbled. Chainlink's interface docs say a reverting
    /// `onReport` "can be retried with a higher gas limit", so bubbling from a cron-driven workflow
    /// would mean retrying a call that cannot succeed yet — every window, at rising gas. The reason
    /// is emitted instead, which is also where the workflow log picks it up.
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external {
        if (msg.sender != FORWARDER) revert InvalidSender(msg.sender, FORWARDER);
        // A short report would make abi.decode read past its end and settle whatever event id the
        // adjacent calldata happened to spell.
        if (report.length != 32) revert MalformedReport(report.length);

        uint256 eventId = abi.decode(report, (uint256));
        // These emits follow an external call, which the linter flags as reorderable by a reentrant
        // caller. Not reachable here on two counts: `settle` moves no value — payouts happen in
        // `claim`, per attendee — so it has no callback to reenter through; and the outcome is the
        // thing being logged, so there is nothing to emit before the call.
        try ESCROW.settle(eventId) {
            // forge-lint: disable-next-line(reentrancy-events)
            emit SettledByWorkflow(eventId);
        } catch (bytes memory reason) {
            // forge-lint: disable-next-line(reentrancy-events)
            emit SettleDeclined(eventId, reason);
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
