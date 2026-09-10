// Generated from contracts/src/AttendanceEscrow.sol — do not edit by hand.
// Regenerate: forge inspect src/AttendanceEscrow.sol:AttendanceEscrow abi --json

export const attendanceEscrowAbi = [
  {
    "type": "function",
    "name": "BEACON_EPOCH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "EPOCH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "FALLBACK_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attest",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "subject",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "code",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "beaconEpoch",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "beaconSig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "attestCount",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attestKeyOf",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "beaconDigest",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "beaconEpoch",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelForQuorum",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "codeDigest",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "subject",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "confirmedCount",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createEvent",
    "inputs": [
      {
        "name": "beaconKey",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "deposit",
        "type": "uint96",
        "internalType": "uint96"
      },
      {
        "name": "capacity",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "minQuorum",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "k",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "registerDeadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "attestOpen",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "attestClose",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "currentBeaconEpoch",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "currentEpoch",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fallbackAvailable",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "gaveCount",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEvent",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AttendanceEscrow.Event",
        "components": [
          {
            "name": "organizer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "beaconKey",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deposit",
            "type": "uint96",
            "internalType": "uint96"
          },
          {
            "name": "capacity",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minQuorum",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "k",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "registerDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "attestOpen",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "attestClose",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum AttendanceEscrow.Status"
          },
          {
            "name": "registered",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "peerConfirmed",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "orgConfirmed",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "sharePerAttendee",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasClaimed",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isConfirmed",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isRegistered",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextEventId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "organizerCheckIn",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "attendees",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pairUsed",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "register",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "attestKey",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "setBeaconKey",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "beaconKey",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "statusOf",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum AttendanceEscrow.Status"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Attested",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "attester",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "subject",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BeaconKeySet",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "beaconKey",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "attendee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Confirmed",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "attendee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "viaOrganizer",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EventCancelled",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "registered",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "minQuorum",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EventCreated",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "organizer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "deposit",
        "type": "uint96",
        "indexed": false,
        "internalType": "uint96"
      },
      {
        "name": "capacity",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "minQuorum",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "k",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "registerDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "attestOpen",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "attestClose",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Registered",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "attendee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "attestKey",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Settled",
    "inputs": [
      {
        "name": "eventId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "confirmed",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "noShows",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "sharePerAttendee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyClaimed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AtCapacity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadBeacon",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadCode",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DeadlinePassed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FallbackLocked",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FallbackPending",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSuchEvent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOrganizer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PairAlreadyUsed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuorumMet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuorumNotMet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SelfAttestation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StaleBeacon",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StaleCode",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongStatus",
    "inputs": []
  }
] as const;
