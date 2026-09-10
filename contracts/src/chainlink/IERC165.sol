// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Declared locally rather than pulled in as a dependency, so this project keeps forge-std
/// as its only one. Copied from smartcontractkit/documentation: public/samples/CRE/IERC165.sol.
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
