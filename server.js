"use strict";

// Don't confuse the three different servers:
// - HTTP(S) file server used to serve the html and js files
// - svgcraft server (this file)
// - peerjs server used to establish p2p connections

class Server extends App {

    constructor(serverId, worldJsonUrl) {
        super();
        this.serverId = serverId;
        this.worldJsonUrl = worldJsonUrl;
        this.avatarId = "avatar0";
        this.clientConns = {}; // maps clientId to PeerJS connection
    }

    init() {
        fetch(this.worldJsonUrl)
            .then(res => res.json())
            .then((j) => this.init_with_json(j));
    }

    init_with_json(j) {
        this.history = j;
        process_json_actions(j);

        const peer = new Peer(this.serverId, {debug: 2});

        peer.on('open', (id) => {
            console.log("PeerJS server gave us ID " + id);
            console.log("Waiting for peers to connect");
            this.finish_init();
        });

        var nextFreeClientId = 1; // 0 is ourselves

        peer.on('connection', (conn) => {
            const clientIdNumber = nextFreeClientId;
            const clientId = `avatar${clientIdNumber}`;
            nextFreeClientId++;

            console.log("Connected to " + conn.peer + ", clientId: " + clientId);

            conn.on('open', () => {
                console.log("Connection to " + conn.peer + " open");
                this.clientConns[clientId] = conn;
                conn.send(this.history);
                this.post([this.new_client_avatar_command(clientIdNumber)]);
                conn.send([{action: "your_id", id: clientId}]);
            });

            conn.on('data', (actions) => {
                console.log(`actions received from client ${clientId}:`);
                console.log(actions);
                // to make sure we know whether we have to avoid sending this update back to client
                for (const a of actions) {
                    a.creatorId = clientId;
                }
                this.post(actions);
            });
            conn.on('close', () => {
                delete this.clientConns[clientId];
                console.log(`Connection to client ${clientId} closed`);
                const m = [];
                for (const g of I("OtherHandles").children) {
                    const idparts = g.getAttribute("id").split("__");
                    if (idparts[1] !== "select") throw "unexpected id format";
                    if (idparts[2] === clientId) {
                        m.push({
                            action: "deselect",
                            who: clientId,
                            what: [idparts[0]]
                        });
                    }
                }
                m.push({action: "del", id: clientId});
                app.post(m);
            });
        });

        peer.on('disconnected', () => {
            console.log("disconnected!");
        });

        peer.on('close', () => {
            console.log('Connection to PeerJS server closed');
        });

        peer.on('error', (err) => {
            console.log(err);
        });
    }

    new_client_avatar_command(clientIdNumber) {
        const c = this.new_avatar0_command();
        const shiftX = Avatar.radius * 4 * clientIdNumber;
        return {
            action: "new",
            tag: "avatar",
            id: `avatar${clientIdNumber}`,
            pos: {x: c.pos.x - shiftX, y: c.pos.y},
            view: {x: c.view.x + shiftX, y: c.view.y, scale: c.view.scale}
        };
    }

    publish(actions) {
        for (const clientId in this.clientConns) {
            const f = actions.filter((a) => a.creatorId !== clientId);
            if (f.length) this.clientConns[clientId].send(f);
        }
    }
}