const crypto = require('crypto')
const Swarm = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const readline = require('readline')
const { read } = require('fs')

/**
 * Save TCP peer connections using the peer id
 * as key: {peer_id: TCP_Connection}
 */
let peers = {};

// Connection counter, used to identify connections
let connSeq = 0;

// Peer identity, a random hash to identify this peer.
let id = crypto.randomBytes(32);
console.log("ID: " + id.toString("hex"));

/**
 * First reference the readline interface.
 * 
 * Then create function to safely call console.log
 * with the readline interface active.
 */
let rl;

let log = (type, data) => {
    if (rl && !process.env.NO_READLINE) {
        rl.clearLine();
        rl.close();
        rl = undefined;
    }

    console.log(type + ": " + data);

    askUser();
};

/**
 * Function to get input text from console and send
 * to other peers as if it were a chat.
 */
let askUser = async () => {
    if (!process.env.NO_READLINE) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question("Message: ", (message) => {
            for (let id in peers) {
                peers[id].connection.write(message);
            }

            rl.close();
            rl = undefined;

            askUser();
        });
    }
}

/**
 * Default DNS and DHT servers, which are used for
 * peer discovery and establishing a connection.
 */
let config = defaults({
    id,
});

let swarm = Swarm(config);

(async () => {
    // Random Unused Port that is used to listen for TCP peer connections
    let port = await getPort();

    swarm.listen(process.env.PORT || port);

    console.log("INFO: Peer listening on port: " + port);

    /**
     * Iris Peer Channel, which peers will use to discover
     * other peers.
     */
    swarm.join("p2piris-swarm");

    swarm.on("connection", (connection, info) => {
        let seq = connSeq;
        let peerId = info.id.toString("hex");

        // Keep alive TCP connection with peer
        if (info.initiator) {
            try {
                connection.setKeepAlive(true, 600);
            } catch (exception) {
                log("ERROR", exception);
            }
        }

        connection.on("data", (data) => {
            // Handle incoming messages
            log("INFO", "From: " + peerId + " - " + data.toString());
        });

        connection.on("close", () => {
            // Handle peer disconnection
            log("INFO", "Connection " + seq + " closed, peer id: " + peerId);

            /**
             * If the closing connection is the last connection
             * with the peer, remove the peer.
             */
            if (peers[peerId].seq === seq) {
                delete peers[peerId];
            }
        });

        // Save connection
        if (!peers[peerId]) {
            peers[peerId] = {}
        }

        peers[peerId].connection = connection;
        peers[peerId].seq = seq;

        connSeq++;
    });

    askUser();
})();
