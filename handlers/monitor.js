const { consoleLog } = require('../utils/logger');

function handleMonitorMessages(ws, data, WSClient) {
    switch(data.type) {
      /*  case 'register':
			
			client.register(
				data.clientType,
				data.clientName,
				data.args
			);
			
			consoleLog(`Registered new client: ${client.toString()}`);
			
			client.send('registered', {
				Id: client.clientId,
				clientType: data.clientType
			});
                           
			WSClient.addMonitorWSClient(client);
			consoleLog(`Added monitor WS Client: ${client.toString()}`);	

			break;*/

        case 'start':
			// Send all current clients to the new monitor
			consoleLog('handleMonitorMessages - start');
			for (const client of WSClient.clients.values()) {	
                consoleLog('H - MONITOR - start : ' + ws.clientId + ' ' + client.toMonitor());			
				ws.send('clientInfo', client.toMonitor());
			}
            break;
        case 'stop':
        case 'destroy':
            WSClient.removeMonitorWSClient(WSClient);
            break;

        case 'report':
            break;
        
    }
}
module.exports = {
    handleMonitorMessages
};