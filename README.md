# QvA Hub LAN
Local network hub for QvA applications with WebRTC support

![QvA Hub LAN](/docs/qvahublan.png)

## Overview
QvA Hub LAN is a Node.js server application that manages local network connections between QvA applications. It includes the QvA Hub LAN Monitor interface for real-time system management.

## Features
- WebSocket server for client connections
- WebRTC signaling server
- Built-in monitoring dashboard
- Multi-client support
- Automatic LAN discovery
- Port management (default: 52330)
- Monitor connections in your LAN

![QvA Hub LAN](/docs/qvahublandemo.png)

## Installation
```bash
npm install qva-hub-lan
```

### Dependencies
- Node.js 18+
- ws: ^8.0.0
- express: ^4.18.0
- qva-hub-lan-monitor: ^1.0.0 (included)

## Usage
```bash
# Start the hub
npm start

# Access monitor interface
http://<server LAN IP>:52330
```

![QvA Hub LAN](/docs/qvahublanmonitor.png)

## Configuration
```json
{
  "port": 52330,
  "allowedClients": ["viewer", "broadcaster"],
  "enableMonitor": true
}
```

## Development
Developed using QvATPC for efficient process management and testing.

![QvA Hub LAN](/docs/qvahublantpc.png)

## Community
Join our Google Group for discussions and updates:
queaso-van-alles@googlegroups.com

## License
MIT License - © 2025 Queaso van Alles