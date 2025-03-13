const os = require('os');
const readline = require('readline');
const { consoleLog } = require('./logger');

function getLANIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    consoleLog("WARNING : No IP found, hosting on localhost 127.0.0.1");
    return '127.0.0.1';
}

function selectNetworkInterface() {
    const interfaces = os.networkInterfaces();
    const validIPs = [];
    
    Object.keys(interfaces).forEach((name, index) => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                validIPs.push(iface.address);
            }
        });
    });

    if (validIPs.length === 1) {
        consoleLog(`Using network interface: ${validIPs[0]}`);
        return Promise.resolve(validIPs[0]);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    consoleLog('\nAvailable network interfaces:');
    validIPs.forEach((ip, index) => {
        consoleLog(`${index + 1}: ${ip}`);
    });

    return new Promise((resolve) => {
        rl.question('\nSelect interface number (Enter for auto-select): ', (answer) => {
            rl.close();
            if (answer.trim() === '') {
                resolve(getLANIP());
            } else {
                const selectedIP = validIPs[parseInt(answer) - 1];
                resolve(selectedIP || getLANIP());
            }
        });
    });
}

module.exports = {
    getLANIP,
    selectNetworkInterface
};