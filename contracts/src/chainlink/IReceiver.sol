// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "./IERC165.sol";

/// @title IReceiver - receives keystone reports
/// @notice Implementations must support the IReceiver interface through ERC165.
/// @dev Signature copied verbatim from smartcontractkit/documentation:
/// public/samples/CRE/IReceiver.sol. The KeystoneForwarder probes a receiver with
/// `supportsInterface(type(IReceiver).interfaceId)` before delivering, and Solidity derives that id
/// from the functions declared here only — so this file's shape decides whether reports arrive at
/// all. SettleReceiver.t.sol pins the resulting id (0x805f2132) for that reason.
interface IReceiver is IERC165 {
    /// @notice Handles incoming keystone reports.
    /// @dev If this function call reverts, it can be retried with a higher gas limit. The receiver
    /// is responsible for discarding stale reports.
    /// @param metadata Report's metadata.
    /// @param report Workflow report.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
