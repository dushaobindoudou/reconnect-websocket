
const EventEmitter = require('events');
const WebSocket = require('ws');


class ReconnectWebSocket extends EventEmitter {
    /**
     * Whether all instances of ReconnectingWebSocket should log debug messages.
     * Setting this to true is the equivalent of setting all instances of ReconnectingWebSocket.debug to true.
     */
    constructor(url, protocols, options) {
        super();
        const settings = {
            /** Whether this instance should log debug messages. */
            debug: false,
            /**
             * Whether or not the websocket should attempt
             * to connect immediately upon instantiation.
             */
            automaticOpen: true,
            /** The number of milliseconds to delay before attempting to reconnect. */
            reconnectInterval: 1000,
            /** The maximum number of milliseconds to delay a reconnection attempt. */
            maxReconnectInterval: 30000 * 2 * 5,
            /**
             * The rate of increase of the reconnect delay.
             * Allows reconnect attempts to back off when problems persist.
             */
            reconnectDecay: 1.5,
            /**
             * The maximum time in milliseconds to
             * wait for a connection to succeed before closing and retrying.
             */
            timeoutInterval: 2000,
            /** The maximum number of reconnection attempts to make. Unlimited if null. */
            maxReconnectAttempts: null,
            /** The binary type, possible values 'blob' or 'arraybuffer', default 'blob'. */
            binaryType: 'blob',
            reconnectAttempt: false,
        };

        const opts = Object.assign({}, settings, options);

        // Overwrite and define settings with options if they exist.
        Object.keys(opts).forEach((v) => {
            this[v] = opts[v];
        });


        this.url = url;

        /**
         * The number of attempted reconnects since starting,
         * or the last successful connection. Read only.
         */
        this.reconnectAttempts = 0;

        /**
         * The current state of the connection.
         * Can be one of: WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED
         * Read only.
         */
        this.readyState = WebSocket.CONNECTING;

        /**
         * A string indicating the name of the sub-protocol the server selected; this will be one of
         * the strings specified in the protocols parameter when creating the WebSocket object.
         * Read only.
         */
        this.protocol = null;
        this.protocols = protocols;

        // Private state variables

        this.self = this;
        this.ws = null;
        this.forcedClose = false;
        // this.timedOut = false;

        if (this.automaticOpen === true) {
            this.open();
        }

    }

    open() {
        this.ws = new WebSocket(this.url, this.protocols || []);
        this.ws.binaryType = this.binaryType;

        if (this.reconnectAttempt) {
            if (this.maxReconnectAttempts && this.reconnectAttempts > this.maxReconnectAttempts) {
                return;
            }
        } else {
            this.emit('connecting');
            this.reconnectAttempts = 0;
        }

        if (this.debug || ReconnectWebSocket.debugAll) {
            console.debug('ReconnectWebSocket', 'attempt-connect', this.url);
        }

        const localWs = this.ws;
        const timeout = setTimeout(() => {
            if (this.debug || ReconnectWebSocket.debugAll) {
                console.debug('ReconnectWebSocket', 'connection-timeout', this.url);
            }
            this.timedOut = true;
            localWs.close();
            this.timedOut = false;
        }, this.timeoutInterval);

        this.ws.onopen = (event) => {
            clearTimeout(timeout);
            if (this.debug || ReconnectWebSocket.debugAll) {
                console.debug('ReconnectWebSocket', 'onopen', this.url);
            }
            this.protocol = this.ws.protocol;
            this.readyState = WebSocket.OPEN;
            this.reconnectAttempts = 0;
            // reconnectAttempt = false;
            this.emit('open', Object.assign({}, event, {
                isReconnect: this.reconnectAttempt,
            }));
        };

        this.ws.onclose = (event) => {
            clearTimeout(timeout);
            this.ws = null;
            if (this.forcedClose) {
                this.readyState = WebSocket.CLOSED;
                this.emit('close');
            } else {
                this.readyState = WebSocket.CONNECTING;
                this.emit('connecting', event);
                if (!this.reconnectAttempt && !this.timedOut) {
                    if (this.debug || ReconnectWebSocket.debugAll) {
                        console.debug('ReconnectWebSocket', 'onclose', this.url);
                    }
                    // eventTarget.dispatchEvent(generateEvent('close'));
                    this.emit('close');
                }
                let nextTimeout = this.reconnectInterval * Math.pow(this.reconnectDecay, this.reconnectAttempts);
                setTimeout(() => {
                    this.reconnectAttempts += 1;
                    this.open(this.reconnectAttempt);
                }, nextTimeout > this.maxReconnectInterval ? this.maxReconnectInterval : nextTimeout);
            }
        };
        
        this.ws.onmessage = (event) => {
            if (this.debug || ReconnectWebSocket.debugAll) {
                console.debug('ReconnectWebSocket', 'onmessage', this.url, event.data);
            }
            this.emit('message', event);
        };

        this.ws.onerror = (event) => {
            if (this.debug || ReconnectWebSocket.debugAll) {
                console.debug('ReconnectWebSocket', 'onerror', this.url, event);
            }
            // eventTarget.dispatchEvent(generateEvent('error'));
            this.emit('error', event);
        };
    }


    /**
     * Transmits data to the server over the WebSocket connection.
     *
     * @param data a text string, ArrayBuffer or Blob to send to the server.
     */
    send(data) {
        if (this.ws) {
            if (this.debug || ReconnectWebSocket.debugAll) {
                console.debug('ReconnectWebSocket', 'send', this.url, data);
            }
            return this.ws.send(data);
        }
        throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
    }


    /**
     * Closes the WebSocket connection or connection attempt, if any.
     * If the connection is already CLOSED, this method does nothing.
     */
    close(code, reason) {
        // Default CLOSE_NORMAL code
        if (typeof code === 'undefined') {
            code = 1000;
        }
        this.forcedClose = true;
        if (this.ws) {
            this.ws.close(code, reason);
        }
    }

    /**
     * Additional public API method to refresh the connection if still open (close, re-open).
     * For example, if the app suspects bad data / missed heart beats, it can try to refresh.
     */
    refresh() {
        if (this.ws) {
            this.ws.close();
        }
    }
    /**
     * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
     * this indicates that the connection is ready to send and receive data.
     */
    onopen(event) {}
    /** An event listener to be called when the WebSocket connection's readyState changes to CLOSED. */
    onclose(event) {}
    /** An event listener to be called when a connection begins being attempted. */
    onconnecting(event) {}
    /** An event listener to be called when a message is received from the server. */
    onmessage(event) {}
    /** An event listener to be called when an error occurs. */
    onerror(event) {}
}


ReconnectWebSocket.debugAll = false;
ReconnectWebSocket.CONNECTING = WebSocket.CONNECTING;
ReconnectWebSocket.OPEN = WebSocket.OPEN;
ReconnectWebSocket.CLOSING = WebSocket.CLOSING;
ReconnectWebSocket.CLOSED = WebSocket.CLOSED;

module.exports = ReconnectWebSocket;
