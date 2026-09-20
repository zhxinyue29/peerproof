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
        /// Comma-separated labels — "Monad,AI,Developers". Stored as one string rather than a
        /// `string[]` because the only consumer is a chip row and a filter, and an array of short
        /// strings costs a slot each to store and a loop to read back. Split on the client.
        string tags;
        /// A link to a picture for the event, or empty.
        ///
        /// A link and not the image, because a contract is the most expensive storage that exists
        /// and this app has no server to upload to — those are the two facts, and a URL is what is
        /// left when both are true. The organizer hosts the picture wherever they already host
        /// pictures; this records where.
        ///
        /// Not validated here. A string that is not a URL renders as a broken image on one card,
        /// which is a cost paid by the person who typed it; making the chain adjudicate what a URL
        /// is would be a permanent rule written for a temporary problem.
        string cover;
        /// Zero until described. Lets a reader tell "no description" from "described with empty
        /// strings", which a caller is free to do.
        uint64 updatedAt;
    }

    /// What `describe` takes: the same fields as a Listing, minus the timestamp the contract
    /// stamps itself.
    ///
    /// A struct rather than six positional strings for two reasons. Solidity runs out of stack
    /// with seven calldata strings in one signature — the immediate cause — and, more usefully,
    /// positional arguments are how a caller silently sends a venue as a tag. The frontend already
    /// shipped one bug of exactly that family: `describe` grew a parameter, two call sites kept
    /// passing the old count, and every listing write in the product failed before it left the
    /// browser. Named fields cannot be transposed.
    struct ListingInput {
        string title;
        string blurb;
        string url;
        string venue;
        string tags;
        string cover;
    }

    /// What an account says about itself.
    ///
    /// Here rather than on a server because there is no server: this app is a static export, and
    /// adding a backend would put a party back into a product whose whole argument is that there
    /// is not one. Here rather than in the escrow for the same reason the listings are — that
    /// contract holds deposits and must stay unable to be reached into. The worst anyone can do by
    /// filling this with nonsense is make their own page read badly.
    ///
    /// Anyone can write their own and nobody can write anybody else's: the key is msg.sender.
    /// Reading is free, which is the whole point — the cost falls on the one person who edits,
    /// never on the people who look.
    struct Profile {
        string name;
        string bio;
        string city;
        /// Handles, not URLs. "@alice" and "alice" are what people know; the link is the client's
        /// job to assemble, and storing a full URL invites a link to anywhere.
        string x;
        string github;
        string website;
        uint64 updatedAt;
    }

    mapping(address => Profile) private _profiles;

    event ProfileSet(address indexed account, string name);

    uint256 public constant MAX_NAME = 40;
    uint256 public constant MAX_BIO = 280;
    uint256 public constant MAX_HANDLE = 40;
    uint256 public constant MAX_WEBSITE = 120;

    /// No admin, no moderation, no owner. Same as everything else here.
    function setProfile(
        string calldata name,
        string calldata bio,
        string calldata city,
        string calldata x,
        string calldata github,
        string calldata website
    ) external {
        if (bytes(name).length > MAX_NAME) revert TooLong();
        if (bytes(bio).length > MAX_BIO) revert TooLong();
        if (bytes(city).length > MAX_NAME) revert TooLong();
        if (bytes(x).length > MAX_HANDLE) revert TooLong();
        if (bytes(github).length > MAX_HANDLE) revert TooLong();
        if (bytes(website).length > MAX_WEBSITE) revert TooLong();

        _profiles[msg.sender] = Profile({
            name: name,
            bio: bio,
            city: city,
            x: x,
            github: github,
            website: website,
            updatedAt: uint64(block.timestamp)
        });
        emit ProfileSet(msg.sender, name);
    }

    function profileOf(address account) external view returns (Profile memory) {
        return _profiles[account];
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
    uint256 public constant MAX_TAGS = 200;
    /// Big enough for a small picture inlined as a `data:` URI, not just a link.
    ///
    /// There is no server to upload to, and that was first answered by storing only a URL. It is
    /// the wrong answer for this product: an event that lives on chain should not have its picture
    /// depend on someone else's hosting staying up. So the client shrinks the image until its
    /// base64 fits in this budget and stores the bytes themselves.
    ///
    /// 12,000 is the ceiling rather than the target. The client aims far lower — every byte here
    /// is paid for once, in gas, by the organizer.
    uint256 public constant MAX_COVER = 12000;

    constructor(address escrowAddress) {
        escrow = IAttendanceEscrow(escrowAddress);
    }

    /// Only the organizer of that event, and only for an event that exists. There is no admin
    /// override: an organizer who writes something wrong fixes it by writing again.
    function describe(uint256 eventId, ListingInput calldata l) external {
        if (eventId == 0 || eventId >= escrow.nextEventId()) revert NoSuchEvent();
        if (escrow.getEvent(eventId).organizer != msg.sender) revert NotOrganizer();
        if (bytes(l.title).length > MAX_TITLE) revert TooLong();
        if (bytes(l.blurb).length > MAX_BLURB) revert TooLong();
        if (bytes(l.url).length > MAX_URL) revert TooLong();
        if (bytes(l.venue).length > MAX_VENUE) revert TooLong();
        if (bytes(l.tags).length > MAX_TAGS) revert TooLong();
        if (bytes(l.cover).length > MAX_COVER) revert TooLong();

        _listings[eventId] = Listing({
            title: l.title,
            blurb: l.blurb,
            url: l.url,
            venue: l.venue,
            tags: l.tags,
            cover: l.cover,
            updatedAt: uint64(block.timestamp)
        });

        emit Described(eventId, msg.sender, l.title);
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
