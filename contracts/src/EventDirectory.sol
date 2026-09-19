// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// The subset of the escrow this contract needs: who created an event.
interface IAttendanceEscrow {
    struct Event {
        address organizer;
        address beaconKey;
        uint96 deposit;
        uint32 capacity;
        uint32 minQuorum;
        uint8 k;
        uint64 registerDeadline;
        uint64 attestOpen;
        uint64 attestClose;
        uint8 status;
        uint32 registered;
        uint32 peerConfirmed;
        uint32 orgConfirmed;
        uint256 sharePerAttendee;
    }

    function getEvent(uint256 eventId) external view returns (Event memory);
    function nextEventId() external view returns (uint256);
}

/// Descriptions for events, kept deliberately outside the escrow.
///
/// The escrow holds deposits and stores only the fields that decide where money goes — no strings,
/// no owner, no upgrade path. A title has no bearing on settlement, so it does not belong in a
/// contract whose entire claim is that nobody can reach into it. Putting it here means the worst
/// anyone can do by filling this with nonsense is make a listing look bad; deposits are untouched.
///
/// Written to storage rather than emitted as a log, because reading it back has to work: Monad's
/// testnet RPC caps `eth_getLogs` at 100 blocks per request, so log-only metadata would be
/// unreadable across any real span of time. An `eth_call` has no such limit and costs nothing.
contract EventDirectory {
    struct Listing {
        string title;
        string blurb;
        /// Optional link to a fuller description — a meetup page, a doc, anything.
        string url;
        /// Where it happens, as the organizer writes it — "Kaiyuan Space, Singapore", "Online".
        ///
        /// Added 2026-09-20, before this contract was ever deployed, so there is no migration and
        /// no second version of the struct to support. A listing without a place is not a listing:
        /// the one question every attendee has before a deposit is "can I get there", and an
        /// attendance product that cannot say where attendance happens is missing its subject.
        ///
        /// Free text and not validated, on purpose. The escrow decides where money goes and this
        /// contract decides nothing — the worst a bad venue string can do is make a card read badly.
        string venue;
        /// Zero until described. Lets a reader tell "no description" from "described with empty
        /// strings", which a caller is free to do.
        uint64 updatedAt;
    }

    IAttendanceEscrow public immutable escrow;

    mapping(uint256 => Listing) private _listings;

    event Described(uint256 indexed eventId, address indexed organizer, string title);

    error NotOrganizer();
    error NoSuchEvent();
    error TooLong();

    /// Bounded so one listing cannot be made unreadable by size, and so the gas a caller has to
    /// pin is predictable — Monad bills the limit, not the usage.
    uint256 public constant MAX_TITLE = 120;
    uint256 public constant MAX_BLURB = 600;
    uint256 public constant MAX_URL = 300;
    uint256 public constant MAX_VENUE = 160;

    constructor(address escrowAddress) {
        escrow = IAttendanceEscrow(escrowAddress);
    }

    /// Only the organizer of that event, and only for an event that exists. There is no admin
    /// override: an organizer who writes something wrong fixes it by writing again.
    function describe(
        uint256 eventId,
        string calldata title,
        string calldata blurb,
        string calldata url,
        string calldata venue
    ) external {
        if (eventId == 0 || eventId >= escrow.nextEventId()) revert NoSuchEvent();
        if (escrow.getEvent(eventId).organizer != msg.sender) revert NotOrganizer();
        if (bytes(title).length > MAX_TITLE) revert TooLong();
        if (bytes(blurb).length > MAX_BLURB) revert TooLong();
        if (bytes(url).length > MAX_URL) revert TooLong();
        if (bytes(venue).length > MAX_VENUE) revert TooLong();

        _listings[eventId] = Listing({
            title: title,
            blurb: blurb,
            url: url,
            venue: venue,
            updatedAt: uint64(block.timestamp)
        });

        emit Described(eventId, msg.sender, title);
    }

    function listingOf(uint256 eventId) external view returns (Listing memory) {
        return _listings[eventId];
    }

    /// Reads a contiguous range in one call, so a directory page costs one request rather than one
    /// per event. `from` is inclusive, `to` exclusive; event ids start at 1.
    function listingsIn(uint256 from, uint256 to) external view returns (Listing[] memory out) {
        if (to <= from) return new Listing[](0);
        out = new Listing[](to - from);
        for (uint256 i = from; i < to; ++i) {
            out[i - from] = _listings[i];
        }
    }
}
