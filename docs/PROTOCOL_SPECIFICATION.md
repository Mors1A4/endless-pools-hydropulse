# Endless Pools Fastlane / Fit@Home Reverse-Engineered Protocol Specification

## Executive Summary

The Endless Pools wireless ecosystem (used in Endless Pools Original Series, Fastlane Pro, and E-Series Swim Spas equipped with the Fit@Home Wi-Fi Kit or modern controllers) uses a local UDP-based binary protocol over Wi-Fi/Ethernet.

- **Status & Telemetry Port**: `45654` (Multicast Group: `239.255.0.1` or direct unicast)
- **Control & Command Port**: `9750` (Target peer port on the pool receiver module; unicast or local subnet broadcast `255.255.255.255`)
- **Control Message Size**: Fixed 44 bytes
- **Telemetry Message Size**: Fixed 111 bytes
- **Checksum Algorithm**: IEEE 802.3 Standard CRC-32 (Polynomial `0xEDB88320`, Initial `0xFFFFFFFF`, Final XOR `0xFFFFFFFF`)

---

## 1. Client-to-Machine Control Packet (44 Bytes)

Sent by the app to port `9750` on the Endless Pools controller to command speed, duration, start, stop, or pause.

### Packet Structure

| Offset | Length (Bytes) | Field Name | Type | Description |
|---|---|---|---|---|
| `0x00` | 1 | Header | `uint8` | Constant `0x0A` |
| `0x01` | 1 | Magic / Sub-header | `uint8` | Constant `0xF0` |
| `0x02` | 1 | `msgId` | `uint8` | Rolling transaction counter in range `[0x64, 0xC6]` (100 to 198 decimal). Incremented per new packet; preserved on retry. |
| `0x03` | 1 | `command` | `uint8` | Command opcode (see Command Table below). |
| `0x04` | 2 | `param` | `uint16_le` | Primary parameter (e.g. pace in seconds/100m, duration in seconds). Little-endian. |
| `0x06` | 6 | `auxParam` | `bytes[6]` | Reserved / Secondary parameters (zero-filled). |
| `0x0C` | 20 | `reserved` | `bytes[20]` | Reserved (zero-filled). |
| `0x20` | 4 | `timestamp` | `uint32_le` | Monotonic millisecond tick since client launch / boot (ensures uniqueness). |
| `0x24` | 1 | Footer 1 | `uint8` | Constant `0x97` |
| `0x25` | 1 | Footer 2 | `uint8` | Constant `0x01` |
| `0x26` | 2 | Reserved | `bytes[2]` | Zero-filled. |
| `0x28` | 4 | `crc32` | `uint32_le` | IEEE 802.3 CRC-32 computed over bytes 0..39. Little-endian. |

### Command Opcodes (`command` byte at offset `0x03`)

| Opcode (Hex) | Name | Parameter Format | Description |
|---|---|---|---|
| `0x1F` | **Start** | `0` | Powers on hydraulic motor and begins swim current. |
| `0x21` | **Stop** | `0` | Powers down hydraulic motor (immediate stop). |
| `0x22` | **Pause Workout** | `0` | Halts motor and freezes workout timer elapsed state. |
| `0x23` | **Unpause Workout** | `0` | Resumes motor at previously commanded pace. |
| `0x24` | **Set Pace** | `uint16` (sec/100m) | Sets current velocity in seconds per 100m (e.g., `105` = 1:45 / 100m). |
| `0x25` | **Set Duration** | `uint16` (sec) | Sets total workout duration cap in seconds. |
| `0x33` | **Initialize Workout**| `0` | Prepares controller state machine for structured workout sets. |
| `0x34` | **Add Step** | Custom | Appends interval step to controller's internal queue. |
| `0x35` | **Start Workout** | `0` | Begins executing internal workout queue. |
| `0x36` | **Cancel Workout**| `0` | Clears internal workout queue. |

---

## 2. Machine-to-Client Telemetry Packet (111 Bytes)

Multicast by the pool controller to `239.255.0.1:45654` (and mirrored to recent client IPs) at approximately 2–4 Hz.

### Packet Structure

| Offset | Length (Bytes) | Field Name | Type | Description |
|---|---|---|---|---|
| `0x00` | 2 | Header | `bytes[2]` | `0x0A 0xF0` |
| `0x02` | 1 | `msgId` | `uint8` | Echoed transaction sequence ID. Acknowledges receipt of client's `msgId`. |
| `0x03` | 1 | `stateCode` | `uint8` | Current machine status / transition state (see State Table below). |
| `0x04` | 1 | `curSpeed` | `uint8` | Current instantaneous flow speed (0–100 or calibrated scale). |
| `0x05` | 1 | `tgtSpeed` | `uint8` | Commanded target speed (controller accelerates/decelerates to this). |
| `0x06` | 1 | Unknown | `uint8` | Internal status flags. |
| `0x07` | 2 | `pace` | `uint16_le` | Current pace in seconds per 100m (`byte[7] + 256 * byte[8]`). |
| `0x09` | 2 | Unknown | `bytes[2]` | Auxiliary status. |
| `0x0B` | 2 | `remaining` | `uint16_le` | Remaining interval time in seconds (`byte[11] + 256 * byte[12]`). |
| `0x0D` | 10 | Reserved | `bytes[10]` | Internal telemetry. |
| `0x17` | 4 | `runtimeSec` | `float32_le` | Current segment elapsed time in seconds (IEEE 754 float). |
| `0x1B` | 4 | `totalRuntimeSec` | `float32_le` | Total active swim time in seconds (IEEE 754 float). |
| `0x1F` | 40 | Reserved | `bytes[40]` | Diagnostics / motor sensor telemetry. |
| `0x47` | 4 | `timestamp` | `uint32_le` | Epoch seconds or monotonic machine uptime. |
| `0x4B` | 36 | Reserved | `bytes[36]` | Proprietary diagnostics. |
| `0x6B` | 4 | `crc32` | `uint32_le` | CRC-32 computed over bytes 0..106. |

### Status Codes (`stateCode` at offset `0x03`)

| Code (Hex) | State Description | Swimmer State |
|---|---|---|
| `0x08` | Idle Off | Motor is off, pool is ready. |
| `0x0F` | Idle On | Motor energized, ready to run. |
| `0x49` | Turning On / Ramping Up | Flow accelerating toward target pace. |
| `0x4B` | Increasing Speed | Current actively speeding up. |
| `0x4A` | Slowing Down | Current actively decreasing speed. |
| `0x4F` | Running at Steady Pace | Flow stable at target pace. |
| `0x4E` | Turning Off / Spin-down | Motor decelerating to stop. |
| `0x0A` | End of Swim | Scheduled interval or duration reached zero. |
| `0x00` | Heartbeat / Paused | Workout paused, holding state. |

---

## 3. Flow Control & State Machine

1. **Transaction Acknowledgement**:
   When the client sends a 44-byte packet with `msgId = K`, it marks `readyToSendNext = false`.
   When a 111-byte status packet arrives with `msgId == K`, the command is acknowledged (`readyToSendNext = true`), and the next command from the client queue is released.
2. **Packet Retransmission**:
   If 2 consecutive 111-byte status packets are received without the expected `msgId` echo, the client marks `resendLastPacket = true` and re-transmits the last 44-byte packet using the same `msgId`.
3. **Safety Interlock**:
   Commands are throttled if the pool reports it is actively shutting down (`0x4E` or `0x0E`), preventing race conditions in hydraulic valve actuators.
