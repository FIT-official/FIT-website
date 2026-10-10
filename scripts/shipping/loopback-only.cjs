// Defense in depth for the isolated preview process and its children. No
// application credentials are inherited; outbound TCP is limited to loopback.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const options = net._normalizeArgs(args)[0];
    const host = options.host || 'localhost';
    if (options.port && (!['127.0.0.1', '::1', 'localhost'].includes(host) || [27017, 27018].includes(Number(options.port)))) {
        throw new Error('Shipping preview blocks external network and database connections');
    }
    return connect.apply(this, args);
};
