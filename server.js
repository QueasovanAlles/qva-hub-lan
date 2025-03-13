const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

var express = require('express');
const session = require('express-session');
var app = express();
var expressWs = require('express-ws')(app);

require('dotenv').config();

const { selectNetworkInterface } = require('./utils/interface-selector');

const { handleMonitorMessages } = require('./handlers/monitor.js');

const { consoleLog } = require('./utils/logger');

// Each client has the optional choice to declare itself of a certain type
// All clients can limit webRTC connection availability to clients of a type
const QvaHubLanWebRTCType = {
	MONITOR: 'monitor',
    BROADCAST: 'broadcast',         // One-to-many streaming (like video hub)
    HOST: 'host',                   // Multiple P2P connections (like FIO)
    PEER: 'peer'                    // Single connection peer
};

class WSClient {

	// monitor - the monitor client is a singleton
    static monitorClients = new Set();
    
    static addMonitorWSClient(wsClient ) {
        WSClient.monitorClients.add(wsClient);
    }

	static isMonitor(wsClient) {
        return WSClient.monitorClients.has(wsClient);
    }

    static removeMonitorWSClient(wsClient) {
        WSClient.monitorClients.delete(wsClient);
    }

    
    // Static collections for WebRTC peers and hosts
    static searchingPeers = new Set();
    static listeningHosts = new Set();

    // Peer management
    static addSearchingPeer(wsClient) {
        WSClient.searchingPeers.add(wsClient);
    }

    static removeSearchingPeer(wsClient) {
        WSClient.searchingPeers.delete(wsClient);
    }

    static isPeerSearching(wsClient) {
        return WSClient.searchingPeers.has(wsClient);
    }

	static findMatchingHosts(allowedPeerTypes) {
		const hosts = Array.from(WSClient.listeningHosts);
		/*console.log('Hosts:', hosts.map(h => ({
			type: h.clientType,
			name: h.clientName,
			id: h.clientId
		})));*/
		//console.log('Allowed peer types:', allowedPeerTypes);
		return hosts
			.filter(host => allowedPeerTypes.includes(host.clientType))
			.map(host => host.toReference());
	}
/*
    static getSearchingPeers() {
        const peerList = [];
        WSClient.searchingPeers.forEach((p) => {
            const peer = p.toReference();
            peer['allowedPeers'] = p.arguments.allowedPeers;
            peerList.push(peer);
        });
        return peerList;
    }*/

    // Host management
    static addListeningHost(wsClient) {
        WSClient.listeningHosts.add(wsClient);
    }

    static removeListeningHost(wsClient) {
        WSClient.listeningHosts.delete(wsClient);
    }

    static isHostListening(wsClient) {
        return WSClient.listeningHosts.has(wsClient);
    }

    static findMatchingPeers(allowedPeerTypes) {
        return Array.from(WSClient.searchingPeers)
            .filter(peer => allowedPeerTypes.includes(peer.clientType));
    }

    static getListeningHosts() {
        const hostList = [];
        WSClient.listeningHosts.forEach((h) => {
            const host = h.toReference();
            host['allowedPeers'] = h.arguments.allowedPeers;
            hostList.push(host);
        });
        return hostList;
    }
 

	// all wsClients - what all clients of all clienttypes have in common
    static clients = new Map();
    
    static generateClientId() {
        return 'client_' + Math.random().toString(36).substr(2, 9);
    }
    
	static get(clientId) {
        const client = WSClient.clients.get(clientId);
		//console.log(`WSClient.get(${clientId}): ${client ? 'found' : 'not found'}`);
		return client;
    }

	static delete(clientId) {
		const client = WSClient.clients.get(clientId);
		if (client) {
			// Remove from all type-specific Sets
			WSClient.removeMonitorWSClient(client);
			WSClient.removeSearchingPeer(client);
			WSClient.removeListeningHost(client);

			// Report to monitors
			WSClient.reportToMonitors('clientDeleted', client.toMonitor());
			
			// Remove from main clients Map
			return WSClient.clients.delete(clientId);
		}
		return false;
	}

    static reportToMonitors(type, args) {
       // consoleLog(`reportToMonitors : ${type} ${JSON.stringify(args)}`);
        WSClient.monitorClients.forEach(monitor => {
			if (monitor.isRegistered === true) {
                consoleLog(`reportToMonitors : ${type} ${JSON.stringify(args)}`);
				monitor.send(type,args);
			}
		});
    }

    constructor(ws, clientId = WSClient.generateClientId()) {
        this.ws = ws;
		this.lastActivity = new Date().getTime();
		this.lastSentMsg = new Date().getTime();
        this.clientId = clientId;
        this.isRegistered = false;
        this.webrtcType = 'unknown'; 
        this.clientType = 'unknown'; 
		this.clientName = 'unknown';
        this.arguments = null;        
		this.peers = new Map();
        WSClient.clients.set(clientId, this);
        WSClient.reportToMonitors('clientConnected', this.toMonitor());

		// on new concept needs to enter implementation 
		// a client can be a 'host' or a 'peer'
		// a host takes multiple peers, a peer is either P2P or P2HOST
    }

    register(webrtcType, clientType, clientName, args) {
        consoleLog(`Registered client : ${clientType} ${clientName} ${JSON.stringify(args)}`);
        this.clientType = clientType;
		this.clientName = clientName;
		this.webrtcType = webrtcType;
        this.arguments = args;
        this.isRegistered = true;
	    this.lastActivity = new Date().getTime();
        WSClient.reportToMonitors('clientRegistered', this.toMonitor());
    }

	send(type, args) {
        consoleLog(`WSClient send : ${type} ${JSON.stringify(args)}`);
        this.lastSentMsg = new Date().getTime();
		this.ws.send(JSON.stringify({
                type: type,
                ...args
        }));
    }

	// the IDentification of a client towards the monitor
	toMonitor() {
		return {
            clientId : this.clientId,
			webrtcType : this.webrtcType,
            clientType : this.clientType, 
			clientName : this.clientName,
            lastActivity : this.lastActivity,
            lastSentMsg : this.lastSentMsg
		}	
	}

    // the IDentification of a client as reference
    toReference() {
		return {
            clientId : this.clientId,
            clientType : this.clientType, 
			clientName : this.clientName
		}	
	}

	toString() {
		return this.clientType + ' ' + this.clientName + ' ' + this.clientId;
	}

}

// Add this to log all WebSocket connections
expressWs.getWss().on('connection', (ws, req) => {
	//consoleLog('WebSocket Raw Connection from:', req.connection.remoteAddress);
});


// WebSocket messaging in LAN network, without authentication is current setup for QvAHub-LAN  project
app.ws('/', function(ws, req) {

	const clientIP = req.connection.remoteAddress;
	consoleLog(`Attempting WS connection from: ${clientIP}`);

    // Consider adding WebSocket connection validation ?


	// This now accepts: Current LAN IP filtering is well implemented
	// - 192.168.x.x (home/office LANs)
	// - 10.x.x.x (VPN/enterprise networks)
	// - 172.16-31.x.x (additional private ranges)
	// - localhost for testing
	if (clientIP.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/) || clientIP.includes('127.0.0.1')) {
		
		const newClient = new WSClient(ws);
		consoleLog(`S - Generated clientId: ${newClient.clientId}`);
		ws.clientId = newClient.clientId;   

		ws.on('message', function(message) {

			const client = WSClient.get(ws.clientId);
			client.lastActivity = new Date().getTime();

			const data = JSON.parse(message);    
			consoleLog(`Received message type: ${data.type} from client: ${client.toString()}`);

				
			if (data.clientType === 'monitor' || client.clientType === 'monitor') {
                if (data.type==='register') {
                    client.register("NONE", data.clientType, data.clientName, data.args);
                    WSClient.addMonitorWSClient(client);
                } else handleMonitorMessages(client, data, WSClient);
			} else {
				let useWebRTCType = data.webrtcType;
				if (client.webrtcType && !useWebRTCType)  useWebRTCType = client.webrtcType;
				switch (useWebRTCType) {
					case QvaHubLanWebRTCType.BROADCAST:
						handleBroadcastMessage(data,client);
						break;
					case QvaHubLanWebRTCType.HOST:
						handleHostMessage(data,client);
						break;
					case QvaHubLanWebRTCType.PEER:
						handlePeerMessage(data,client);
						break;
					default:
						consoleLog(`WS MESSAGE ERROR : Unknown client type: ${data.clientType}`);
				}
			}
		});

		ws.on('close', () => {
            const client = WSClient.get(ws.clientId);
			consoleLog(`Client disconnected: ${client.toString()}`);
			WSClient.delete(client.clientId);
		});


	}
});

function handlePeerMessage(data, client) {
    switch(data.type) {
        case 'register':
            client.register(data.webrtcType, data.clientType, data.clientName, data.args);
			client.send('registered', {clientId : client.clientId});

            WSClient.addSearchingPeer(client);
            
            const matchingHosts = WSClient.findMatchingHosts(data.args.allowedPeers);
            client.send('hostList', { hosts: matchingHosts });

            break;

        case 'offer':			
            const targetHost = WSClient.get(data.targetHost);
            consoleLog(`handlePeerMessage offer form  ${client.clientId} to ${data.targetHost}`);
            if (targetHost) {
                targetHost.send('offer', {
                    offer: data.offer,
                    peerId: client.clientId,
                    peerName: client.clientName
                });
            } else consoleLog(`handlePeerMessage offer ${data.targetHost} not found`);
            break;

        case 'candidate':
            const candidateHost = WSClient.get(data.targetHost);
            if (candidateHost) {
                candidateHost.send('candidate', {
                    candidate: data.candidate,
                    peerId: client.clientId,
                    fromPeer: true
                });
            } else consoleLog(`handlePeerMessage candidate ${data.targetHost} not found`);
            break;
		case 'foundHost':
			// peer is no longer searching
			WSClient.removeSearchingPeer(client);
			// monitor info : foundId (= host) and peerId are WebRTC connected now
			WSClient.reportToMonitors('webRTCConnection', {host:data.foundId, peer:client.clientId});
			
    }
}

function handleHostMessage(data, client) {
    switch(data.type) {
        case 'register':
            client.register(data.webrtcType, data.clientType, data.clientName, data.args);
			client.send('registered', {clientId : client.clientId});

            WSClient.addListeningHost(client);
            
            const matchingPeers = WSClient.findMatchingPeers(data.args.allowedPeers);
            matchingPeers.forEach(peer => {
                peer.send('hostAvailable', client.toReference());
            });
			
            break;

        case 'answer':
            const answerPeer = WSClient.get(data.targetClient);
            if (answerPeer) {
                answerPeer.send('answer', {
                    answer: data.answer,
                    hostId: client.clientId,
                    hostName: client.clientName
                });
            } else consoleLog(`handleHostMessage answer ${answerPeer} not found`);
            break;

        case 'candidate':
            const candidatePeer = WSClient.get(data.targetClient);
            if (candidatePeer) {
                candidatePeer.send('candidate', {
                    candidate: data.candidate,
                    hostId: client.clientId,
                    fromHost: true
                });
            } else consoleLog(`handleHostMessage candidate ${data.targetClient} not found`);
            break;
    }
}

function handleBroadcastMessage(data, client) {
    switch(data.type) {
        case 'register':
            client.register(data.webrtcType, data.clientType, data.clientName, data.args);
            broadcastClients.set(client.clientId, client);
            notifyMonitors('broadcastAvailable', {
                clientId: client.clientId,
                clientType: data.webrtcType
            });
            break;
        case 'offer':
        case 'answer':
        case 'candidate':
            handleWebRTCSignaling(data, client);
            break;
    }
}


function generateClientId() {
	return 'client_' + Math.random().toString(36).substr(2, 9);
}

selectNetworkInterface().then(selectedIP => {

    const LANHost = selectedIP;
    const port = process.argv[2] || process.env.PORT || 52330;

	app.use((req, res, next) => {
		consoleLog(`New http client : ${req.ip} (vs ${LANHost})`);
		if (req.ip.includes('127.0.0.1') || req.ip === LANHost) {
			consoleLog(`Accepted http client : ${req.ip}`);
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
			next();
		} else {
			res.status(403).send('Access denied');
		}
	});

	app.use(express.static(path.join(__dirname, 'monitor')));

	app.get('/api/myip', (req, res) => {
		res.send(req.ip);
	});

	app.get('/api/serverip', (req, res) => {
		res.send(LANHost);
	});

	app.get('*', (req, res) => {
		res.sendFile(path.join(__dirname, 'monitor'));
	});

    app.listen(port, LANHost, () => {
        consoleLog(`Server running on http://${LANHost}:${port}`);
    });

});




