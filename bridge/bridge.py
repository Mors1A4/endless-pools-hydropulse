#!/usr/bin/env python3
"""
Endless Pools Local LAN WebSocket-to-UDP Multicast Bridge
Bridges local browser WebSockets with the pool's UDP Multicast network
"""

import asyncio
import socket
import struct
import websockets
import sys

UDP_MULTICAST_GROUP = '239.255.0.1'
UDP_TELEMETRY_PORT = 45654
UDP_CONTROL_PORT = 9750
WS_PORT = 9751

connected_clients = set()

def create_multicast_socket():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('', UDP_TELEMETRY_PORT))
    except Exception as e:
        print(f"[WARN] Bind to port {UDP_TELEMETRY_PORT}: {e}")

    # Join multicast group
    mreq = struct.pack("4sl", socket.inet_aton(UDP_MULTICAST_GROUP), socket.INADDR_ANY)
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        print(f"[UDP] Joined multicast group {UDP_MULTICAST_GROUP}:{UDP_TELEMETRY_PORT}")
    except Exception as e:
        print(f"[WARN] IP_ADD_MEMBERSHIP: {e}")

    sock.setblocking(False)
    return sock

def create_control_socket():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.setblocking(False)
    return sock

async def handle_ws(websocket):
    connected_clients.add(websocket)
    print(f"[WS] Client connected from {websocket.remote_address} (Total: {len(connected_clients)})")
    ctrl_sock = create_control_socket()

    try:
        async for message in websocket:
            if isinstance(message, bytes) and len(message) == 44:
                # Forward 44-byte control packet to pool
                ctrl_sock.sendto(message, ('255.255.255.255', UDP_CONTROL_PORT))
                print(f"[UDP TX] Sent 44-byte control cmd=0x{message[3]:02x} to port {UDP_CONTROL_PORT}")
    except Exception as e:
        print(f"[WS] Client error: {e}")
    finally:
        connected_clients.remove(websocket)
        ctrl_sock.close()
        print(f"[WS] Client disconnected. (Remaining: {len(connected_clients)})")

async def udp_listener_loop(sock):
    loop = asyncio.get_running_loop()
    print(f"[UDP] Listening for 111-byte pool telemetry on port {UDP_TELEMETRY_PORT}...")
    while True:
        try:
            data, addr = await loop.sock_recvfrom(sock, 1024)
            if len(data) == 111 and connected_clients:
                # Broadcast telemetry to all connected browser clients
                websockets_tasks = [client.send(data) for client in connected_clients if client.open]
                if websockets_tasks:
                    await asyncio.gather(*websockets_tasks, return_exceptions=True)
        except Exception:
            await asyncio.sleep(0.01)

async def main():
    print("=" * 60)
    print("  HydroPulse Endless Pools LAN WebSocket <-> UDP Bridge")
    print(f"  WebSocket Server: ws://localhost:{WS_PORT}")
    print(f"  UDP Multicast:    {UDP_MULTICAST_GROUP}:{UDP_TELEMETRY_PORT}")
    print(f"  UDP Control:      Port {UDP_CONTROL_PORT}")
    print("=" * 60)

    udp_sock = create_multicast_socket()
    ws_server = await websockets.serve(handle_ws, "0.0.0.0", WS_PORT)

    await asyncio.gather(
        udp_listener_loop(udp_sock),
        ws_server.wait_closed()
    )

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBridge stopped.")
